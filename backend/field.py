"""Field-task payloads: volunteers never receive citizen PII."""

from __future__ import annotations

from volunteers import get_volunteer, load_org, need_label

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

SAFETY = "Do not enter unstable structures or slopes. Stay back from floodwater, smoke, fire, oil, and chemicals."


def task_text(need: str, incident_type: str = "") -> str:
    base = TASK_COPY.get(need) or TASK_COPY["field_assessment"]
    if incident_type in ("erosion",) and need in ("field_assessment", "site_assessment"):
        return "Assess the landslide or erosion site and document debris and access conditions."
    return base


def assignment_payload(need: str, responder: dict, assigned_by: str, incident_type: str = "") -> dict:
    from volunteers import utc_now

    return {
        "need": need,
        "need_label": need_label(need),
        "responder_id": responder["id"],
        "responder_name": responder.get("name") or responder["id"],
        "status": "pending",
        "task": task_text(need, incident_type),
        "safety": SAFETY,
        "assigned_by": assigned_by or load_org().get("name") or "EarthRelay Response Team",
        "assigned_at": utc_now(),
    }


def strip_case(case: dict, volunteer: dict | None = None) -> dict:
    assignment = dict(case.get("assignment") or {})
    access = (volunteer or {}).get("access") or {
        "assigned_only": True,
        "photos": True,
        "location": True,
        "contact_citizen": False,
    }
    photo = case.get("image_url") if access.get("photos") else None
    lat = case.get("lat") if access.get("location") else None
    lng = case.get("lng") if access.get("location") else None
    contact = None
    if access.get("contact_citizen") and case.get("phone"):
        contact = {"phone": case.get("phone")}
    return {
        "id": case.get("id"),
        "display_id": case.get("display_id") or case.get("id"),
        "incident_type": case.get("incident_type"),
        "title": assignment.get("need_label") or need_label(assignment.get("need") or "") or "Field task",
        "priority": (case.get("report") or {}).get("priority") or case.get("priority") or "LOW",
        "lat": lat,
        "lng": lng,
        "image_url": photo,
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
