"""Case store: JSON on this machine, synced to Supabase when configured."""

from __future__ import annotations

import json
import uuid
from datetime import datetime, timezone
from pathlib import Path

from report import haversine_m
from routing import PHONE_NOTICE, TEAMS as TEAM_META, enrich_case, format_location, route_for, team_ids

DATA_DIR = Path(__file__).resolve().parent / "data"
CASES_DIR = DATA_DIR / "cases"
UPLOAD_DIR = DATA_DIR / "uploads"
DELETED_PATH = DATA_DIR / "deleted_cases.json"

STATUSES = ("pending", "under_investigation", "cleanup_scheduled", "resolved")
ROLES = ("citizen", "ngo")
TEAMS = team_ids()

INCIDENT_TYPES = (
    "illegal_dumping",
    "plastic_waste",
    "overflowing_garbage",
    "construction_debris",
    "e_waste",
    "tires_dumped",
    "oil_spill",
    "sewage_discharge",
    "water_pollution",
    "wildfire_smoke",
    "grass_fire",
    "factory_smoke",
    "burning_trash",
    "flood_damage",
    "river_overflow",
    "urban_flooding",
    "erosion",
    "deforestation",
    "illegal_logging",
    "habitat_destruction",
    "wildlife",
    "injured_wildlife",
    "air_pollution",
    "chemical_spill",
    "earthquake",
    "other",
)

FAMILIES = {
    "waste": {
        "illegal_dumping",
        "plastic_waste",
        "overflowing_garbage",
        "construction_debris",
        "e_waste",
        "tires_dumped",
    },
    "fire": {"wildfire_smoke", "grass_fire", "burning_trash", "factory_smoke"},
    "flood": {"flood_damage", "river_overflow", "urban_flooding", "water_pollution"},
    "sewage": {"sewage_discharge"},
    "erosion": {"erosion"},
    "forest": {"deforestation", "illegal_logging", "habitat_destruction"},
    "wildlife": {"wildlife", "injured_wildlife"},
    "quake": {"earthquake"},
}

MERGE_RADIUS_M = {
    "quake": 80,
    "flood": 1200,
    "fire": 400,
    "waste": 250,
    "sewage": 250,
    "erosion": 350,
    "forest": 400,
    "wildlife": 300,
}


def family_of(incident_type: str) -> str:
    for name, group in FAMILIES.items():
        if incident_type in group:
            return name
    return "other"


def same_incident_family(left: str | None, right: str | None) -> bool:
    """True only when both filings are the same hazard (flood with flood, not flood with fire)."""
    family = family_of(left or "other")
    if family == "other":
        return False
    return family == family_of(right or "other")


def _is_demo_case(case: dict) -> bool:
    if case.get("demo"):
        return True
    cid = str(case.get("id") or "")
    return len(cid) > 1 and cid[0] == "s" and cid[1:].isdigit()


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def next_display_id() -> str:
    ensure_dirs()
    best = 0
    for path in CASES_DIR.glob("*.json"):
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            continue
        raw = str(data.get("display_id") or "")
        digits = "".join(ch for ch in raw if ch.isdigit())
        if digits:
            best = max(best, int(digits))
    return f"ER-{best + 1:05d}"


def case_path(case_id: str) -> Path:
    return CASES_DIR / f"{case_id}.json"


def save_case(case: dict) -> dict:
    ensure_dirs()
    case_path(case["id"]).write_text(json.dumps(case, indent=2), encoding="utf-8")
    try:
        from cloud import push_case

        push_case(case)
    except Exception:
        pass
    return case


def case_has_photo(case: dict) -> bool:
    urls = []
    if case.get("image_url"):
        urls.append(str(case["image_url"]))
    for report in case.get("reports") or []:
        if report.get("image_url"):
            urls.append(str(report["image_url"]))
    names = {Path(url.replace("\\", "/")).name for url in urls if url}
    cid = str(case.get("id") or "")
    if cid:
        names.update({f"{cid}_original.jpg", f"{cid}_original.png", f"{cid}_original.webp"})
    for name in names:
        if not name:
            continue
        path = UPLOAD_DIR / name
        if path.exists() and path.stat().st_size > 200:
            return True
    return False


def load_deleted_ids() -> set[str]:
    if not DELETED_PATH.exists():
        return set()
    try:
        data = json.loads(DELETED_PATH.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return set()
    if not isinstance(data, list):
        return set()
    return {str(item) for item in data if item}


def is_case_deleted(case_id: str) -> bool:
    return str(case_id or "") in load_deleted_ids()


def mark_case_deleted(case_id: str) -> None:
    cid = str(case_id or "").strip()
    if not cid:
        return
    ids = load_deleted_ids()
    ids.add(cid)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    DELETED_PATH.write_text(json.dumps(sorted(ids), indent=2), encoding="utf-8")


def _purge_case_files(case_id: str) -> bool:
    path = case_path(case_id)
    existed = path.exists()
    if existed:
        path.unlink()
    for extra in UPLOAD_DIR.glob(f"{case_id}_*"):
        try:
            extra.unlink()
        except OSError:
            pass
    return existed


def delete_case(case_id: str) -> bool:
    """Remove a case from disk and cloud. Tombstone so cloud pull cannot restore it."""
    ensure_dirs()
    mark_case_deleted(case_id)
    existed = _purge_case_files(case_id)
    try:
        from cloud import delete_remote_case

        delete_remote_case(case_id)
    except Exception:
        pass
    return existed


def get_case(case_id: str) -> dict | None:
    if is_case_deleted(case_id):
        return None
    path = case_path(case_id)
    if not path.exists():
        try:
            from cloud import pull_one

            remote = pull_one(case_id)
            if remote:
                case = enrich_case(remote)
                case["has_photo"] = case_has_photo(case)
                return case
        except Exception:
            return None
        return None
    case = enrich_case(json.loads(path.read_text(encoding="utf-8")))
    case["has_photo"] = case_has_photo(case)
    return case


def list_cases() -> list[dict]:
    ensure_dirs()
    try:
        from cloud import pull_cases

        pull_cases()
    except Exception:
        pass
    deleted = load_deleted_ids()
    for cid in deleted:
        _purge_case_files(cid)
    if not any(CASES_DIR.glob("*.json")) and not deleted:
        try:
            from seed_demo_cases import seed_if_empty

            seed_if_empty()
        except Exception:
            pass
    cases = []
    for path in CASES_DIR.glob("*.json"):
        try:
            case = enrich_case(json.loads(path.read_text(encoding="utf-8")))
            if str(case.get("id") or path.stem) in deleted:
                continue
            case["has_photo"] = case_has_photo(case)
            if not case["has_photo"]:
                continue
            cases.append(case)
        except json.JSONDecodeError:
            continue
    cases.sort(
        key=lambda item: (
            0 if item.get("status") == "resolved" else 1,
            item.get("updated_at") or item.get("created_at") or "",
        ),
        reverse=True,
    )
    return cases


def find_duplicate(lat: float | None, lng: float | None, incident_type: str, radius_m: float | None = None) -> dict | None:
    """Merge only another live report of the same hazard nearby. Flood does not merge with fire."""
    if lat is None or lng is None:
        return None
    family = family_of(incident_type)
    if family == "other":
        return None
    if radius_m is None:
        radius_m = MERGE_RADIUS_M.get(family, 300)
    best = None
    best_dist = radius_m
    for case in list_cases():
        if _is_demo_case(case):
            continue
        if case.get("status") == "resolved":
            continue
        if not same_incident_family(incident_type, case.get("incident_type")):
            continue
        if case.get("lat") is None or case.get("lng") is None:
            continue
        dist = haversine_m(lat, lng, float(case["lat"]), float(case["lng"]))
        if dist <= best_dist:
            best = case
            best_dist = dist
    if best:
        best["_duplicate_distance_m"] = round(best_dist)
    return best


def attach_report(case: dict, *, reporter_role: str, notes: str, image_url: str, annotated_url: str, original_name: str) -> dict:
    reports = case.setdefault("reports", [])
    reports.append(
        {
            "id": str(uuid.uuid4())[:8],
            "at": utc_now(),
            "reporter_role": reporter_role,
            "notes": notes,
            "image_url": image_url,
            "annotated_url": annotated_url,
            "original_name": original_name,
        }
    )
    case["report_count"] = len(reports)
    case["updated_at"] = utc_now()
    case["timeline"].append(
        {
            "at": utc_now(),
            "status": case.get("status"),
            "detail": f"Duplicate report merged from {reporter_role} ({len(reports)} total within 300 m).",
        }
    )
    return save_case(case)


def create_case(
    *,
    title: str,
    incident_type: str,
    notes: str,
    lat: float | None,
    lng: float | None,
    original_name: str,
    detection: dict,
    reporter_role: str = "citizen",
    reporter_name: str = "",
    address: str = "",
    phone: str = "",
    first_name: str = "",
    last_name: str = "",
    location_source: str = "",
    location_accuracy_m: float | None = None,
    nearby: list | None = None,
    location_parts: dict | None = None,
) -> dict:
    case_id = str(uuid.uuid4())[:8]
    incident = incident_type if incident_type in INCIDENT_TYPES else "other"
    role = reporter_role if reporter_role in ROLES else "citizen"
    routed = route_for(incident)
    image_url = f"/uploads/{case_id}_original.jpg"
    annotated_url = f"/uploads/{case_id}_annotated.jpg"
    location_text = address or format_location(lat, lng)
    display_id = next_display_id()
    from phone import optional_phone

    phone_value = optional_phone(phone or "")
    case = {
        "id": case_id,
        "display_id": display_id,
        "title": title or f"Case {display_id}",
        "incident_type": incident,
        "status": "pending",
        "priority": "LOW",
        "assigned_team": routed["id"],
        "routed_to": routed["id"],
        "routed_label": routed["label"],
        "reporter_role": role,
        "reporter_name": reporter_name or f"{first_name} {last_name}".strip(),
        "first_name": first_name,
        "last_name": last_name,
        "phone": phone_value,
        "phone_notice": PHONE_NOTICE,
        "notes": notes or "",
        "lat": lat,
        "lng": lng,
        "address": location_text,
        "nearby": list(nearby or []),
        "location_parts": dict(location_parts or {}),
        "claimed_by": "",
        "claimed_at": None,
        "assignment": None,
        "location_source": location_source or ("gps" if lat is not None else ""),
        "location_accuracy_m": location_accuracy_m,
        "activity": [],
        "last_call_at": None,
        "last_call_result": "",
        "created_at": utc_now(),
        "updated_at": utc_now(),
        "original_name": original_name,
        "image_url": image_url,
        "annotated_url": annotated_url,
        "detection": detection,
        "report": {},
        "report_count": 1,
        "reports": [
            {
                "id": case_id,
                "at": utc_now(),
                "reporter_role": role,
                "notes": notes,
                "image_url": image_url,
                "annotated_url": annotated_url,
                "original_name": original_name,
            }
        ],
        "timeline": [
            {
                "at": utc_now(),
                "status": "pending",
                "detail": f"{role} submitted evidence. Auto-forwarded to {routed['label']}.",
            }
        ],
    }
    return save_case(case)


def update_case(case_id: str, **changes) -> dict | None:
    case = get_case(case_id)
    if not case:
        return None
    if changes.get("status") in STATUSES:
        case["status"] = changes["status"]
        status_detail = changes.get("detail")
        if not status_detail:
            status_detail = "Case closed." if changes["status"] == "resolved" else f"Status set to {changes['status']}."
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": changes["status"],
                "detail": status_detail,
            }
        )
    if changes.get("priority") in ("LOW", "MEDIUM", "HIGH"):
        case["priority"] = changes["priority"]
        report = case.get("report")
        if isinstance(report, dict):
            report["priority"] = changes["priority"]
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": case.get("status"),
                "detail": changes.get("detail") or f"Priority set to {changes['priority']}.",
            }
        )
    if isinstance(changes.get("assignment"), dict):
        case["assignment"] = changes["assignment"]
        label = changes["assignment"].get("responder_name") or "a responder"
        need = changes["assignment"].get("need_label") or changes["assignment"].get("need") or "a field task"
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": case.get("status"),
                "detail": f"Assigned {need} to {label}.",
            }
        )
        if case.get("status") == "pending":
            case["status"] = "under_investigation"
    if changes.get("assignment_status") and isinstance(case.get("assignment"), dict):
        next_status = str(changes["assignment_status"])
        if next_status in ("pending", "accepted", "in_progress", "done"):
            case["assignment"]["status"] = next_status
            case["timeline"].append(
                {
                    "at": utc_now(),
                    "status": case.get("status"),
                    "detail": f"Field task {next_status}.",
                }
            )
    if changes.get("assigned_team") in TEAMS:
        case["assigned_team"] = changes["assigned_team"]
        meta = TEAM_META.get(changes["assigned_team"])
        if meta:
            case["routed_to"] = meta["id"]
            case["routed_label"] = meta["label"]
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": case.get("status"),
                "detail": f"Assigned to {case.get('routed_label') or changes['assigned_team']}.",
            }
        )
    if "claimed_by" in changes and changes["claimed_by"] is not None:
        name = str(changes["claimed_by"]).strip()
        case["claimed_by"] = name
        case["claimed_at"] = utc_now() if name else None
        if name and case.get("status") == "pending":
            case["status"] = "under_investigation"
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": case.get("status"),
                "detail": f"{name} took this case." if name else "Case returned to inbox.",
            }
        )
    if "address" in changes and changes["address"] is not None:
        case["address"] = changes["address"]
    if "nearby" in changes and changes["nearby"] is not None:
        case["nearby"] = changes["nearby"]
    if "location_parts" in changes and changes["location_parts"] is not None:
        case["location_parts"] = changes["location_parts"]
    if "notes" in changes and changes["notes"] is not None:
        case["notes"] = changes["notes"]
    if changes.get("title"):
        case["title"] = changes["title"]
    if "phone" in changes and changes["phone"] is not None:
        from phone import optional_phone

        try:
            phone = optional_phone(str(changes["phone"]))
        except ValueError as exc:
            raise ValueError(str(exc)) from exc
        if phone:
            case["phone"] = phone
            case["timeline"].append(
                {
                    "at": utc_now(),
                    "status": case.get("status"),
                    "detail": "Reporter phone number saved for dispatch.",
                }
            )
    if changes.get("lat") is not None:
        case["lat"] = changes["lat"]
    if changes.get("lng") is not None:
        case["lng"] = changes["lng"]
    if changes.get("location_source"):
        case["location_source"] = changes["location_source"]
    if changes.get("location_accuracy_m") is not None:
        case["location_accuracy_m"] = changes["location_accuracy_m"]
    if changes.get("activity_kind"):
        kind = str(changes["activity_kind"])
        result = str(changes.get("activity_result") or "")
        by = str(changes.get("activity_by") or "").strip()
        labels = {
            "no_answer": "Called — no answer",
            "spoke": "Called — spoke",
            "left_message": "Called — left message",
            "on_site": "On site",
            "cleanup_started": "Cleanup started",
        }
        entry = {"at": utc_now(), "kind": kind, "result": result, "by": by, "label": labels.get(result, result)}
        case.setdefault("activity", []).append(entry)
        if kind == "call":
            case["last_call_at"] = entry["at"]
            case["last_call_result"] = result
        if result == "on_site" and case.get("status") == "pending":
            case["status"] = "under_investigation"
        if result == "cleanup_started":
            case["status"] = "cleanup_scheduled"
        case["timeline"].append(
            {
                "at": entry["at"],
                "status": case.get("status"),
                "detail": f"{by + ': ' if by else ''}{entry['label']}.",
            }
        )
    if changes.get("lat") is not None and case.get("lng") is not None:
        source = case.get("location_source") or "map_pin"
        acc = case.get("location_accuracy_m")
        extra = f" (±{round(acc)} m)" if isinstance(acc, (int, float)) else ""
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": case.get("status"),
                "detail": f"{'GPS' if source == 'gps' else 'Map pin'} saved{extra}.",
            }
        )
    case["updated_at"] = utc_now()
    return save_case(case)


def cases_geojson() -> dict:
    features = []
    for case in list_cases():
        if case.get("lat") is None or case.get("lng") is None:
            continue
        features.append(
            {
                "type": "Feature",
                "geometry": {"type": "Point", "coordinates": [case["lng"], case["lat"]]},
                "properties": {
                    "id": case["id"],
                    "display_id": case.get("display_id") or case["id"],
                    "hazard": "case",
                    "title": case["title"],
                    "severity": (case.get("report") or {}).get("priority") or case.get("priority"),
                    "source": "EarthRelay",
                    "time": case["created_at"],
                    "url": None,
                    "description": case.get("notes") or case["incident_type"],
                    "incident_type": case["incident_type"],
                    "status": case["status"],
                    "priority": (case.get("report") or {}).get("priority") or case.get("priority"),
                    "emergency": bool((case.get("report") or {}).get("emergency")),
                    "routed_to": case.get("routed_to"),
                    "address": case.get("address"),
                },
            }
        )
    return {"type": "FeatureCollection", "features": features}


def nearby_cases(case_id: str, radius_m: float = 1000) -> list[dict]:
    origin = get_case(case_id)
    if not origin or origin.get("lat") is None or origin.get("lng") is None:
        return []
    origin_type = origin.get("incident_type") or "other"
    nearby = []
    for other in list_cases():
        if other["id"] == case_id:
            continue
        if other.get("lat") is None or other.get("lng") is None:
            continue
        if not same_incident_family(origin_type, other.get("incident_type")):
            continue
        dist = haversine_m(origin["lat"], origin["lng"], other["lat"], other["lng"])
        if dist <= radius_m:
            nearby.append({**other, "distance_m": round(dist)})
    nearby.sort(
        key=lambda item: (
            1 if item.get("status") == "resolved" else 0,
            item["distance_m"],
        )
    )
    return nearby
