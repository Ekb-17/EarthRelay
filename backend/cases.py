"""Local case store so EarthRelay works without Supabase."""

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
        "oil_spill",
        "sewage_discharge",
        "chemical_spill",
        "water_pollution",
    },
    "fire": {"wildfire_smoke", "grass_fire", "factory_smoke", "burning_trash", "air_pollution", "earthquake"},
    "water": {"flood_damage", "river_overflow", "urban_flooding", "erosion", "water_pollution", "oil_spill"},
    "forest": {"deforestation", "illegal_logging", "habitat_destruction"},
    "wildlife": {"wildlife", "injured_wildlife"},
}


def family_of(incident_type: str) -> str:
    for name, group in FAMILIES.items():
        if incident_type in group:
            return name
    return "other"


def utc_now() -> str:
    return datetime.now(timezone.utc).isoformat()


def ensure_dirs() -> None:
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def case_path(case_id: str) -> Path:
    return CASES_DIR / f"{case_id}.json"


def save_case(case: dict) -> dict:
    ensure_dirs()
    case_path(case["id"]).write_text(json.dumps(case, indent=2), encoding="utf-8")
    return case


def get_case(case_id: str) -> dict | None:
    path = case_path(case_id)
    if not path.exists():
        return None
    return enrich_case(json.loads(path.read_text(encoding="utf-8")))


def list_cases() -> list[dict]:
    ensure_dirs()
    cases = []
    for path in CASES_DIR.glob("*.json"):
        try:
            cases.append(enrich_case(json.loads(path.read_text(encoding="utf-8"))))
        except json.JSONDecodeError:
            continue
    cases.sort(key=lambda item: item.get("updated_at") or item.get("created_at") or "", reverse=True)
    return cases


def find_duplicate(lat: float | None, lng: float | None, incident_type: str, radius_m: float = 300) -> dict | None:
    if lat is None or lng is None:
        return None
    family = family_of(incident_type)
    best = None
    best_dist = radius_m
    for case in list_cases():
        if case.get("lat") is None or case.get("lng") is None:
            continue
        if family_of(case.get("incident_type") or "other") != family:
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
    phone: str = "",
    first_name: str = "",
    last_name: str = "",
    address: str = "",
    location_source: str = "",
) -> dict:
    case_id = str(uuid.uuid4())[:8]
    incident = incident_type if incident_type in INCIDENT_TYPES else "other"
    role = reporter_role if reporter_role in ROLES else "citizen"
    routed = route_for(incident)
    image_url = f"/uploads/{case_id}_original.jpg"
    annotated_url = f"/uploads/{case_id}_annotated.jpg"
    location_text = address or format_location(lat, lng)
    case = {
        "id": case_id,
        "title": title or f"Case {case_id}",
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
        "phone": (phone or "").strip(),
        "phone_notice": PHONE_NOTICE,
        "notes": notes or "",
        "lat": lat,
        "lng": lng,
        "address": location_text,
        "claimed_by": "",
        "claimed_at": None,
        "location_source": location_source or ("gps" if lat is not None else ""),
        "location_accuracy_m": None,
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
        case["timeline"].append(
            {
                "at": utc_now(),
                "status": changes["status"],
                "detail": changes.get("detail") or f"Status set to {changes['status']}.",
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
    if "notes" in changes and changes["notes"] is not None:
        case["notes"] = changes["notes"]
    if changes.get("title"):
        case["title"] = changes["title"]
    if "phone" in changes and changes["phone"] is not None:
        phone = str(changes["phone"]).strip()
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
