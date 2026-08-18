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

# Citizen incident type → desk. Fire + earthquake share the fire team.
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


def route_for(incident_type: str | None) -> dict:
    team_id = ROUTE_MAP.get(incident_type or "other", "earthrelay-org")
    team = TEAMS[team_id]
    return {
        "id": team["id"],
        "label": team["label"],
        "short": team["short"],
        "blurb": team["blurb"],
    }


def enrich_case(case: dict) -> dict:
    routed = route_for(case.get("incident_type"))
    team_id = normalize_team(case.get("routed_to") or case.get("assigned_team") or routed["id"])
    team = TEAMS.get(team_id) or TEAMS["earthrelay-org"]
    case["routed_to"] = team["id"]
    case["routed_label"] = team["label"]
    case["assigned_team"] = team["id"]
    case.setdefault("phone_notice", PHONE_NOTICE)
    case.setdefault("claimed_by", "")
    case.setdefault("address", "")
    return case


def format_location(lat: float | None, lng: float | None, street: str | None = None) -> str:
    if lat is None or lng is None:
        return ""
    coords = f"{lat:.5f}, {lng:.5f}"
    if street:
        return f"{street} (GPS {coords})"
    return f"GPS {coords}"
