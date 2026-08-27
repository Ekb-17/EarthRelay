"""Field-task payloads: volunteers receive site location, never citizen name or phone."""

from __future__ import annotations

import re

from volunteers import get_volunteer, load_org, need_label

HAZARD_LABELS = {
    "flood": "flood",
    "flood_damage": "flood",
    "river_overflow": "flood",
    "fire": "fire",
    "wildfire": "fire",
    "structure_fire": "fire",
    "waste": "waste dumping",
    "illegal_dumping": "waste dumping",
    "garbage": "waste dumping",
    "sewage": "sewage",
    "sewage_overflow": "sewage",
    "erosion": "erosion / landslide",
    "landslide": "erosion / landslide",
    "collapse": "collapse",
    "building_collapse": "collapse",
    "deforestation": "deforestation",
    "illegal_logging": "deforestation",
    "habitat_destruction": "deforestation",
    "wildlife": "wildlife issue",
    "injured_wildlife": "wildlife issue",
}

TASK_COPY = {
    "cleanup": "Remove debris only from stable ground. Photograph before and after if safe.",
    "field_assessment": "Assess the affected area and document debris and access conditions.",
    "supplies": "Deliver or stage supplies as directed. Do not enter the hazard itself.",
    "community": "Support people nearby with information and non-entry assistance.",
    "debris_cleanup": "Remove debris only from stable ground. Photograph before and after if safe.",
    "site_assessment": "Assess the affected area and document debris and access conditions.",
    "community_support": "Support people nearby with information and non-entry assistance.",
    "wildlife_assistance": "Assess the area from a safe distance. Do not handle wildlife unless trained.",
    "emergency_response": "Stay back from the hazard. Do not enter unstable ground, floodwater, smoke, or fire.",
}

SAFETY_BY_HAZARD = {
    "flood": "Stay out of floodwater. Do not drive or wade through it. Watch for downed lines and contamination.",
    "fire": "Stay upwind of smoke and heat. Do not enter burned or smoldering structures. Report active flame to authorities.",
    "sewage": "Avoid contact with sewage. Use gloves and boots. Do not enter confined drains or pits.",
    "waste": "Wear gloves. Do not handle sharps, chemicals, or medical waste. Bag only what you are trained to move.",
    "erosion": "Stay clear of unstable slopes and undercut banks. Do not stand below loose debris.",
    "collapse": "Do not enter damaged structures. Stay outside the collapse zone and report shifting debris.",
    "deforestation": "Stay on stable ground. Do not confront operators. Photograph from a safe distance only.",
    "wildlife": "Do not handle wildlife. Keep distance and wait for trained responders.",
}

DEFAULT_SAFETY = (
    "Do not enter unstable structures or slopes. Stay back from floodwater, smoke, fire, oil, and chemicals."
)

_NON_LATIN = re.compile(r"[^\x00-\x7F]")


def hazard_phrase(incident_type: str = "") -> str:
    key = str(incident_type or "").strip().lower()
    if key in HAZARD_LABELS:
        return HAZARD_LABELS[key]
    # Map kind prefixes
    for prefix, label in (
        ("flood", "flood"),
        ("fire", "fire"),
        ("sewage", "sewage"),
        ("waste", "waste dumping"),
        ("erosion", "erosion / landslide"),
        ("collapse", "collapse"),
        ("deforest", "deforestation"),
        ("wildlife", "wildlife issue"),
    ):
        if key.startswith(prefix):
            return label
    text = key.replace("_", " ").strip()
    return text or "environmental hazard"


def hazard_kind(incident_type: str = "") -> str:
    key = str(incident_type or "").strip().lower()
    aliases = {
        "illegal_logging": "deforestation",
        "habitat_destruction": "deforestation",
        "illegal_dumping": "waste",
        "garbage": "waste",
        "landslide": "erosion",
        "wildfire": "fire",
        "structure_fire": "fire",
        "river_overflow": "flood",
        "flood_damage": "flood",
        "sewage_overflow": "sewage",
        "injured_wildlife": "wildlife",
        "building_collapse": "collapse",
    }
    if key in aliases:
        return aliases[key]
    for kind in ("flood", "fire", "sewage", "waste", "erosion", "collapse", "deforestation", "wildlife"):
        if key == kind or key.startswith(kind):
            return kind
    return ""


def task_text(need: str, incident_type: str = "") -> str:
    hazard = hazard_phrase(incident_type)
    need_key = need or "field_assessment"

    if need_key in ("cleanup", "debris_cleanup"):
        return (
            f"Cleanup for a {hazard} site. Remove debris only from stable ground. "
            "Photograph before and after if safe."
        )
    if need_key in ("field_assessment", "site_assessment"):
        if hazard_kind(incident_type) == "erosion":
            return "Assess the landslide or erosion site and document debris and access conditions."
        return f"Assess this {hazard} site and document conditions, access, and visible damage."
    if need_key == "supplies":
        return f"Deliver or stage supplies for this {hazard} response. Do not enter the hazard itself."
    if need_key in ("community", "community_support"):
        return f"Support people near this {hazard} site with information and non-entry assistance."
    if need_key == "wildlife_assistance":
        return "Assess the area from a safe distance. Do not handle wildlife unless trained."
    if need_key == "emergency_response":
        return f"Stay back from this {hazard}. Do not enter unstable ground, floodwater, smoke, or fire."

    base = TASK_COPY.get(need_key) or TASK_COPY["field_assessment"]
    return f"{hazard.capitalize()} response. {base}"


def safety_text(incident_type: str = "") -> str:
    kind = hazard_kind(incident_type)
    return SAFETY_BY_HAZARD.get(kind) or DEFAULT_SAFETY


def assignment_payload(need: str, responder: dict, assigned_by: str, incident_type: str = "") -> dict:
    from volunteers import utc_now

    return {
        "need": need,
        "need_label": need_label(need),
        "responder_id": responder["id"],
        "responder_name": responder.get("name") or responder["id"],
        "status": "pending",
        "task": task_text(need, incident_type),
        "safety": safety_text(incident_type),
        "assigned_by": assigned_by or load_org().get("name") or "EarthRelay Response Team",
        "assigned_at": utc_now(),
    }


def _readable_place(text: str) -> bool:
    """Skip long non-Latin admin strings that clutter volunteer labels."""
    value = str(text or "").strip()
    if not value:
        return False
    if len(value) > 40 and _NON_LATIN.search(value):
        return False
    # Prefer dropping pure non-Latin territory names when we already have area/city
    non_latin = len(_NON_LATIN.findall(value))
    if non_latin > len(value) * 0.4 and len(value) > 18:
        return False
    return True


def area_label_for(case: dict) -> str:
    """Neighborhood/city only — not reporter name or phone."""
    parts = case.get("location_parts") or {}
    area = str(parts.get("area") or "").strip()
    city = str(parts.get("city") or "").strip()
    # Prefer area + city only; skip noisy state/admin (often long Urdu territory names)
    chunks = [piece for piece in (area, city) if piece and _readable_place(piece)]
    seen = []
    for piece in chunks:
        if piece.lower() not in {item.lower() for item in seen}:
            seen.append(piece)
    return ", ".join(seen[:2])


def street_address_for(case: dict) -> str:
    """Street / road for the site. Never reporter name or phone."""
    parts = case.get("location_parts") or {}
    road = str(parts.get("road") or "").strip()
    if road and _readable_place(road):
        return road
    address = str(case.get("address") or "").strip()
    if not address or address.lower().startswith("gps "):
        return ""
    cleaned = re.sub(r"\s*\(GPS [^)]+\)\s*$", "", address).strip()
    return cleaned if _readable_place(cleaned) else ""


def strip_case(case: dict, volunteer: dict | None = None) -> dict:
    raw_assignment = dict(case.get("assignment") or {})
    incident_type = case.get("incident_type") or ""
    access = (volunteer or {}).get("access") or {
        "assigned_only": True,
        "photos": True,
        "location": True,
        "contact_citizen": False,
    }
    photo = case.get("image_url") if access.get("photos") else None
    lat = case.get("lat") if access.get("location") else None
    lng = case.get("lng") if access.get("location") else None
    area_label = area_label_for(case) if access.get("location") else ""
    street = street_address_for(case) if access.get("location") else ""
    contact = None
    if access.get("contact_citizen") and case.get("phone"):
        contact = {"phone": case.get("phone")}

    # Refresh task/safety for display so older assignments pick up hazard-aware copy
    assignment = dict(raw_assignment)
    if assignment:
        need = assignment.get("need") or ""
        assignment["task"] = task_text(need, incident_type)
        assignment["safety"] = safety_text(incident_type)

    return {
        "id": case.get("id"),
        "display_id": case.get("display_id") or case.get("id"),
        "incident_type": incident_type,
        "title": assignment.get("need_label") or need_label(assignment.get("need") or "") or "Field task",
        "priority": (case.get("report") or {}).get("priority") or case.get("priority") or "LOW",
        "lat": lat,
        "lng": lng,
        "area_label": area_label,
        "street": street,
        "image_url": photo,
        "has_photo": bool(photo),
        "assignment": assignment,
        "access": {
            "photos": bool(access.get("photos")),
            "location": bool(access.get("location")),
            "contact_citizen": bool(access.get("contact_citizen")),
        },
        "contact": contact,
    }


def tasks_for(volunteer_id: str, cases: list[dict]) -> list[dict]:
    volunteer = get_volunteer(volunteer_id)
    if not volunteer or volunteer.get("status") not in ("active", "invited"):
        return []
    out = []
    for case in cases:
        assignment = case.get("assignment") or {}
        if assignment.get("responder_id") != volunteer_id:
            continue
        if case.get("status") == "resolved":
            continue
        out.append(strip_case(case, volunteer))
    return out


def task_for(volunteer_id: str, case: dict | None) -> dict | None:
    if not case:
        return None
    volunteer = get_volunteer(volunteer_id)
    assignment = case.get("assignment") or {}
    if not volunteer or assignment.get("responder_id") != volunteer_id:
        return None
    return strip_case(case, volunteer)
