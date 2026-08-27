"""Team helpline directory for EarthRelay response desks."""

from __future__ import annotations

HELPLINES = [
    {
        "id": "flood",
        "name": "Flood / water helpline",
        "categories": ["Flood", "River overflow", "Urban flooding"],
        "phone": "042-111-FLOOD (042-111-35663)",
        "short_phone": "04211135663",
        "note": "Standing water, overflow, and urban flooding.",
    },
    {
        "id": "sewage",
        "name": "Sewage / sanitation helpline",
        "categories": ["Sewage discharge", "Water pollution"],
        "phone": "042-111-SEWAGE (042-111-73924)",
        "short_phone": "04211173924",
        "note": "Discharge, blocked drains, and contaminated water.",
    },
    {
        "id": "fire",
        "name": "Fire helpline",
        "categories": ["Wildfire / smoke", "Grass fire", "Burning trash", "Factory smoke"],
        "phone": "042-111-FIRE (042-111-3473)",
        "short_phone": "0421113473",
        "note": "Wildfire, grass fire, burning waste, and industrial smoke.",
    },
    {
        "id": "wildlife",
        "name": "Wildlife helpline",
        "categories": ["Wildlife", "Injured wildlife"],
        "phone": "042-111-WILD (042-111-9453)",
        "short_phone": "0421119453",
        "note": "Injured or distressed wildlife and habitat disturbance.",
    },
    {
        "id": "deforestation",
        "name": "Forest / deforestation helpline",
        "categories": ["Deforestation", "Illegal logging", "Habitat destruction"],
        "phone": "042-111-FOREST (042-111-36737)",
        "short_phone": "04211136737",
        "note": "Tree cutting, logging, and habitat loss.",
    },
    {
        "id": "earthquake",
        "name": "Earthquake / collapse helpline",
        "categories": ["Earthquake", "Structural collapse"],
        "phone": "042-111-QUAKE (042-111-78253)",
        "short_phone": "04211178253",
        "note": "Ground movement, collapse, and debris at the site.",
    },
    {
        "id": "dumping",
        "name": "Illegal dumping helpline",
        "categories": ["Illegal dumping", "Plastic waste", "Overflowing garbage", "Construction debris", "Tires", "E-waste"],
        "phone": "042-111-DUMP (042-111-3867)",
        "short_phone": "0421113867",
        "note": "Dumps, overflow, debris, tires, and e-waste.",
    },
    {
        "id": "erosion",
        "name": "Erosion / landslide helpline",
        "categories": ["Erosion", "Mudslide"],
        "phone": "042-111-SLOPE (042-111-75673)",
        "short_phone": "04211175673",
        "note": "Slope failure, washout, and unstable ground.",
    },
    {
        "id": "general",
        "name": "EarthRelay main helpline",
        "categories": ["Other", "General environmental cases"],
        "phone": "042-111-EARTH (042-111-32784)",
        "short_phone": "04211132784",
        "note": "Use this line when the hazard type is unclear.",
    },
]


def helpline_directory() -> dict:
    return {
        "title": "Helpline",
        "lead": "Call the desk that matches the incident. These numbers reach EarthRelay response teams for that hazard.",
        "lines": list(HELPLINES),
    }
