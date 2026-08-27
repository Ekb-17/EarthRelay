"""Auto-route citizen cases to the right response desk."""

from __future__ import annotations

PHONE_NOTICE = "For critical or important info, the organization may call you."

TEAMS = {
    "earthrelay-org": {
        "id": "earthrelay-org",
        "label": "EarthRelay organization",
        "short": "Your org",
        "blurb": "Dumping, waste, and general environmental cases.",
    },
    "fire-team": {
        "id": "fire-team",
        "label": "Fire response team",
        "short": "Fire team",
        "blurb": "Fire, smoke, burning, and earthquake reports.",
    },
    "water-unit": {
        "id": "water-unit",
        "label": "Water unit",
        "short": "Water",
        "blurb": "Flood, sewage, and water pollution.",
    },
    "wildlife-unit": {
        "id": "wildlife-unit",
        "label": "Wildlife unit",
        "short": "Wildlife",
        "blurb": "Injured or at-risk wildlife.",
    },
}

# Citizen incident type → inbox desk. The on-screen team name is more specific.
ROUTE_MAP = {
    "wildfire_smoke": "fire-team",
    "grass_fire": "fire-team",
    "factory_smoke": "fire-team",
    "burning_trash": "fire-team",
    "earthquake": "fire-team",
    "illegal_dumping": "earthrelay-org",
    "plastic_waste": "earthrelay-org",
    "overflowing_garbage": "earthrelay-org",
    "construction_debris": "earthrelay-org",
    "e_waste": "earthrelay-org",
    "tires_dumped": "earthrelay-org",
    "oil_spill": "earthrelay-org",
    "chemical_spill": "earthrelay-org",
    "air_pollution": "earthrelay-org",
    "deforestation": "earthrelay-org",
    "illegal_logging": "earthrelay-org",
    "habitat_destruction": "earthrelay-org",
    "other": "earthrelay-org",
    "sewage_discharge": "water-unit",
    "water_pollution": "water-unit",
    "flood_damage": "water-unit",
    "river_overflow": "water-unit",
    "urban_flooding": "water-unit",
    "erosion": "water-unit",
    "wildlife": "wildlife-unit",
    "injured_wildlife": "wildlife-unit",
}

RESPONSE_TEAMS = {
    "illegal_dumping": "dumping response team",
    "plastic_waste": "plastic waste removal team",
    "overflowing_garbage": "waste collection team",
    "construction_debris": "debris removal team",
    "e_waste": "e-waste recovery team",
    "tires_dumped": "tire waste removal team",
    "oil_spill": "oil spill response team",
    "sewage_discharge": "sanitation response team",
    "water_pollution": "water pollution response team",
    "wildfire_smoke": "fire response team",
    "grass_fire": "fire response team",
    "factory_smoke": "smoke response team",
    "burning_trash": "fire response team",
    "flood_damage": "flood response team",
    "river_overflow": "flood response team",
    "urban_flooding": "flood response team",
    "erosion": "erosion response team",
    "deforestation": "forest protection team",
    "illegal_logging": "forest protection team",
    "habitat_destruction": "habitat recovery team",
    "wildlife": "wildlife response team",
    "injured_wildlife": "wildlife rescue team",
    "air_pollution": "air quality response team",
    "chemical_spill": "hazardous materials team",
    "earthquake": "earthquake response team",
    "other": "organization",
}

LEGACY_TEAMS = {
    "unassigned": "earthrelay-org",
    "field-alpha": "earthrelay-org",
    "field-bravo": "earthrelay-org",
    "fire-liaison": "fire-team",
}


def team_ids() -> tuple[str, ...]:
    return tuple(TEAMS.keys()) + tuple(LEGACY_TEAMS.keys())


def normalize_team(team: str | None) -> str:
    if team in TEAMS:
        return team
    return LEGACY_TEAMS.get(team or "", "earthrelay-org")


def response_team(incident_type: str | None) -> str:
    return RESPONSE_TEAMS.get(incident_type or "other", RESPONSE_TEAMS["other"])


def route_for(incident_type: str | None) -> dict:
    team_id = ROUTE_MAP.get(incident_type or "other", "earthrelay-org")
    team = TEAMS[team_id]
    label = response_team(incident_type)
    return {
        "id": team["id"],
        "label": label,
        "short": team["short"],
        "blurb": team["blurb"],
    }


def enrich_case(case: dict) -> dict:
    from cases import _is_demo_case

    routed = route_for(case.get("incident_type"))
    team_id = normalize_team(case.get("routed_to") or case.get("assigned_team") or routed["id"])
    team = TEAMS.get(team_id) or TEAMS["earthrelay-org"]
    case["routed_to"] = team["id"]
    case["routed_label"] = response_team(case.get("incident_type"))
    case["assigned_team"] = team["id"]
    case.setdefault("phone_notice", PHONE_NOTICE)
    case.setdefault("claimed_by", "")
    case.setdefault("address", "")
    if _is_demo_case(case):
        case["demo"] = True
    return case


def format_location(lat: float | None, lng: float | None, street: str | None = None) -> str:
    if lat is None or lng is None:
        return ""
    coords = f"{lat:.5f}, {lng:.5f}"
    if street:
        return f"{street} (GPS {coords})"
    return f"GPS {coords}"
