"""Full environmental case intelligence report.

YOLO names objects it actually knows (bottles, trucks, wildlife). Gemini, when
configured, reads the photograph. Pixel color is never treated as a class:
blue sky is not a river, and an orange fruit is not fire.
"""

from __future__ import annotations

import json
import math
import os
from collections import Counter
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

from net import read_geojson

GEMINI_FLASH_MODELS = ("gemini-3.6-flash",)
GEMINI_PRO_MODELS = ("gemini-3.1-pro-preview",)
GEMINI_MODELS = GEMINI_FLASH_MODELS
GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-3.6-flash:generateContent"
)

YOLO_TO_FINDING = {
    "truck": "possible haul / dump vehicle",
    "boat": "waterway activity",
    "bird": "wildlife present",
    "cat": "animal present",
    "dog": "animal present",
    "cow": "livestock / habitat use",
    "horse": "livestock / habitat use",
    "sheep": "livestock / habitat use",
    "bear": "wildlife present",
    "elephant": "wildlife present",
}

HOUSEHOLD_LABELS = {
    "laptop",
    "tv",
    "cell phone",
    "keyboard",
    "mouse",
    "remote",
    "microwave",
    "oven",
    "toaster",
    "refrigerator",
    "sink",
    "toilet",
    "couch",
    "bed",
    "chair",
    "dining table",
    "book",
    "clock",
    "vase",
    "scissors",
    "teddy bear",
    "hair drier",
    "toothbrush",
    "cup",
    "bowl",
    "wine glass",
    "fork",
    "knife",
    "spoon",
    "potted plant",
}

NEUTRAL_LABELS = {"person", "backpack", "handbag", "tie", "umbrella", "suitcase", "car", "motorcycle", "bus", "bicycle"}
FIELD_LABELS = {
    "truck",
    "boat",
    "bird",
    "horse",
    "sheep",
    "cow",
    "elephant",
    "bear",
    "zebra",
    "giraffe",
}

INCIDENT_PACKS = {
    "illegal_dumping": {
        "findings": ["illegal dumping", "possible waste pile"],
        "causes": ["Illegal dumping", "Poor waste collection"],
        "risks": ["Soil contamination", "Wildlife attraction to waste", "Water contamination if rain washes debris"],
        "immediate": ["Notify local authority", "Secure the site", "Photograph extent for evidence"],
        "long_term": ["Increase waste collection", "Community awareness campaigns"],
    },
    "plastic_waste": {
        "findings": ["plastic waste"],
        "causes": ["Illegal dumping", "Poor waste management", "Littering"],
        "risks": ["Wildlife ingestion", "Microplastic formation", "Water contamination"],
        "immediate": ["Notify local authority", "Install temporary waste barriers", "Organize cleanup"],
        "long_term": ["Increase waste collection", "Community awareness campaigns"],
    },
    "water_pollution": {
        "findings": ["possible water pollution"],
        "causes": ["Upstream discharge", "Dumping", "Sewage overflow"],
        "risks": ["Harm to aquatic life", "Reduced water quality", "Community exposure"],
        "immediate": ["Notify environmental authority", "Do not treat visual cues as lab results", "Collect water samples for testing"],
        "long_term": ["Monitor the reach", "Trace upstream sources"],
    },
    "wildfire_smoke": {
        "findings": ["smoke", "possible vegetation fire"],
        "causes": ["Vegetation fire", "Land clearing", "Accidental ignition"],
        "risks": ["Fire spread", "Habitat loss", "Smoke exposure"],
        "immediate": ["Alert fire service", "Warn nearby communities", "Watch wind direction"],
        "long_term": ["Fuel management", "Restoration after containment"],
    },
    "flood_damage": {
        "findings": ["flooding / standing water"],
        "causes": ["Heavy rain", "Blocked drainage", "River overflow"],
        "risks": ["Contamination spread", "Habitat disruption", "Infrastructure damage"],
        "immediate": ["Warn downstream communities", "Avoid floodwater contact", "Document high-water marks"],
        "long_term": ["Clear drainage", "Restore banks"],
    },
    "sewage_discharge": {
        "findings": ["possible sewage discharge"],
        "causes": ["Broken pipe", "Overflowing sewer", "Illegal discharge"],
        "risks": ["Pathogen exposure", "Water contamination", "Odor"],
        "immediate": ["Avoid contact with the water", "Keep people and animals back", "Notify sanitation"],
        "long_term": ["Repair the line", "Sample the water if needed"],
    },
    "deforestation": {
        "findings": ["possible habitat / tree damage"],
        "causes": ["Land clearing", "Illegal cutting"],
        "risks": ["Habitat loss", "Erosion", "Wildlife displacement"],
        "immediate": ["Document tree stumps / machinery", "Notify forest authority"],
        "long_term": ["Restoration planting", "Patrol the site"],
    },
    "wildlife": {
        "findings": ["wildlife concern"],
        "causes": ["Habitat disturbance", "Waste entanglement", "Unknown"],
        "risks": ["Injury", "Poisoning", "Displacement"],
        "immediate": ["Keep people and pets back", "Contact wildlife responder"],
        "long_term": ["Remove attractants", "Protect the corridor"],
    },
    "earthquake": {
        "findings": ["possible structural / ground damage"],
        "causes": ["Earthquake", "Aftershock", "Ground failure"],
        "risks": ["Collapse", "Injury from debris", "Blocked access"],
        "immediate": ["Stay clear of damaged structures", "Alert emergency services", "Watch for aftershocks"],
        "long_term": ["Inspect remaining structures", "Clear debris safely"],
    },
    "erosion": {
        "findings": ["unstable slope / mud movement"],
        "causes": ["Heavy rain", "Undercut bank", "Vegetation loss"],
        "risks": ["Further slide", "Blocked roads", "Sediment in waterways"],
        "immediate": ["Keep people off the slope", "Warn downhill areas", "Do not walk on the slide"],
        "long_term": ["Stabilize the slope", "Restore vegetation"],
    },
}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


FRUIT_OR_FOOD = {"orange", "apple", "banana", "carrot", "pizza", "donut", "cake", "sandwich", "hot dog"}
FIRE_TYPES = {"wildfire_smoke", "grass_fire", "burning_trash"}
WATER_TYPES = {
    "water_pollution",
    "sewage_discharge",
    "flood_damage",
    "river_overflow",
    "urban_flooding",
    "erosion",
}
WASTE_TYPES = {
    "illegal_dumping",
    "plastic_waste",
    "overflowing_garbage",
    "construction_debris",
    "e_waste",
    "tires_dumped",
}
WATER_LABEL_HINTS = ("river", "water body", "waterway", "lake", "stream", "ocean", "sea")

ALLOWED_TYPES = (
    "illegal_dumping",
    "sewage_discharge",
    "wildfire_smoke",
    "flood_damage",
    "erosion",
    "deforestation",
    "wildlife",
    "earthquake",
    "other",
)

GEMINI_TYPE_ALIASES = {
    "fire": "wildfire_smoke",
    "smoke": "wildfire_smoke",
    "wildfire": "wildfire_smoke",
    "grass_fire": "wildfire_smoke",
    "burning_trash": "wildfire_smoke",
    "collapse": "earthquake",
    "collapsed_building": "earthquake",
    "structural_damage": "earthquake",
    "building_collapse": "earthquake",
    "rubble": "earthquake",
    "earthquake_damage": "earthquake",
    "flood": "flood_damage",
    "flooding": "flood_damage",
    "river_overflow": "flood_damage",
    "urban_flooding": "flood_damage",
    "urban_flood": "flood_damage",
    "water_pollution": "flood_damage",
    "polluted_water": "flood_damage",
    "dirty_water": "flood_damage",
    "contaminated_water": "flood_damage",
    "dumping": "illegal_dumping",
    "dump": "illegal_dumping",
    "waste": "illegal_dumping",
    "plastic": "illegal_dumping",
    "plastic_waste": "illegal_dumping",
    "garbage": "illegal_dumping",
    "overflowing_garbage": "illegal_dumping",
    "construction_debris": "illegal_dumping",
    "e_waste": "illegal_dumping",
    "tires_dumped": "illegal_dumping",
    "oil": "other",
    "oil_spill": "other",
    "chemical": "other",
    "chemical_spill": "other",
    "hazmat": "other",
    "air": "other",
    "dust": "other",
    "air_pollution": "other",
    "factory_smoke": "other",
    "logging": "deforestation",
    "illegal_logging": "deforestation",
    "trees": "deforestation",
    "habitat_destruction": "deforestation",
    "habitat": "deforestation",
    "landslide": "erosion",
    "mudslide": "erosion",
    "explosion": "other",
    "injured_animal": "wildlife",
    "injured_wildlife": "wildlife",
    "sewage": "sewage_discharge",
    "sewer": "sewage_discharge",
    "outfall": "sewage_discharge",
    "manhole": "sewage_discharge",
    "sewage_discharge": "sewage_discharge",
}
PACK_ALIASES = {
    "grass_fire": "wildfire_smoke",
    "burning_trash": "wildfire_smoke",
    "factory_smoke": "other",
    "river_overflow": "flood_damage",
    "urban_flooding": "flood_damage",
    "water_pollution": "flood_damage",
    "oil_spill": "other",
    "sewage_discharge": "water_pollution",
    "plastic_waste": "illegal_dumping",
    "overflowing_garbage": "illegal_dumping",
    "construction_debris": "illegal_dumping",
    "e_waste": "illegal_dumping",
    "tires_dumped": "illegal_dumping",
    "illegal_logging": "deforestation",
    "habitat_destruction": "deforestation",
    "injured_wildlife": "wildlife",
    "other": "illegal_dumping",
}


def _as_finding(item) -> dict:
    if isinstance(item, dict):
        label = str(item.get("label") or "").strip()
        conf = item.get("confidence", 0.6)
        try:
            conf = float(conf)
        except (TypeError, ValueError):
            conf = 0.6
        if conf > 1:
            conf = conf / 100.0
        return {
            "label": label,
            "source": item.get("source") or "model",
            "confidence": max(0.0, min(conf, 1.0)),
            **({"caveat": item["caveat"]} if item.get("caveat") else {}),
        }
    return {"label": str(item), "source": "model", "confidence": 0.6}


def _is_water_label(label: str) -> bool:
    text = label.lower()
    if "pollution" in text:
        return False
    return any(hint in text for hint in WATER_LABEL_HINTS)


def _is_fire_label(label: str) -> bool:
    text = label.lower()
    if "fruit" in text or "food" in text:
        return False
    return any(word in text.split() for word in ("fire", "flame", "smoke", "burn")) or "smoke" in text or "wildfire" in text


def sanitize_findings(findings: list, incident_type: str, yolo_labels: list | None) -> list[dict]:
    """Drop color-confused labels. Fruit is fruit. Sky is not a river."""
    yolo = {str(label).lower() for label in (yolo_labels or [])}
    saw_boat = "boat" in yolo
    cleaned = []
    for raw in findings or []:
        item = _as_finding(raw)
        label = item["label"]
        if not label:
            continue
        lower = label.lower()
        if any(food in lower for food in FRUIT_OR_FOOD) and _is_fire_label(lower):
            continue
        if item.get("source") == "scene":
            continue
        if _is_water_label(lower) and item.get("source") not in {"scene_vision", "gemini"}:
            if incident_type in FIRE_TYPES and not saw_boat:
                continue
            if incident_type not in WATER_TYPES and not saw_boat and item.get("source") != "gemini":
                continue
        cleaned.append(item)
    unique = {}
    for item in cleaned:
        unique[item["label"]] = item
    return list(unique.values())


def indoor_household_scene(yolo_labels: list | None, scene_kind: str | None = None) -> bool:
    if scene_kind in {"fire", "flood", "collapse"}:
        return False
    labels = [str(label).lower() for label in (yolo_labels or [])]
    bottle_count = sum(1 for label in labels if label == "bottle")
    if bottle_count >= 3:
        return False
    if any(label in FIELD_LABELS for label in labels):
        return False
    useful = [label for label in labels if label not in NEUTRAL_LABELS]
    if not useful:
        return False
    household = [label for label in useful if label in HOUSEHOLD_LABELS or label in FRUIT_OR_FOOD]
    return bool(household) and len(household) >= max(1, round(len(useful) * 0.5))


def reporter_family(incident_type: str) -> str:
    if incident_type in FIRE_TYPES:
        return "fire"
    if incident_type in WATER_TYPES:
        return "water"
    if incident_type in WASTE_TYPES:
        return "waste"
    if incident_type in {"deforestation", "illegal_logging", "habitat_destruction"}:
        return "forest"
    if incident_type in {"wildlife", "injured_wildlife"}:
        return "wildlife"
    if incident_type == "earthquake":
        return "earthquake"
    return "other"


def pack_for(incident_type: str) -> dict:
    return INCIDENT_PACKS.get(incident_type) or INCIDENT_PACKS.get(PACK_ALIASES.get(incident_type, ""), INCIDENT_PACKS["illegal_dumping"])


def _priority_for(score: float) -> str:
    if score >= 8:
        return "HIGH"
    if score >= 6:
        return "MEDIUM"
    return "LOW"


def normalize_incident_type(raw) -> str:
    text = str(raw or "").strip().lower().replace(" ", "_").replace("-", "_")
    text = GEMINI_TYPE_ALIASES.get(text, text)
    if text in ALLOWED_TYPES:
        return text
    return "other"


def normalize_photo_kind(raw, incident_type: str = "") -> str:
    kind = str(raw or "").strip().lower()
    if kind == "air":
        kind = "indoor"
    if kind == "chemical":
        kind = "unknown"
    if kind in {"fire", "flood", "waste", "collapse", "indoor", "erosion", "wildlife", "sewage", "storm", "unknown"}:
        return kind
    family = reporter_family(incident_type)
    if family == "fire":
        return "fire"
    if family == "water" and incident_type in {"flood_damage", "river_overflow", "urban_flooding"}:
        return "flood"
    if incident_type == "sewage_discharge":
        return "sewage"
    if incident_type == "erosion":
        return "erosion"
    if family == "waste":
        return "waste"
    if family == "earthquake":
        return "collapse"
    if family == "wildlife":
        return "wildlife"
    if family == "other" or not incident_type:
        return "unknown"
    return "unknown"


STAYBACK_KINDS = {"fire", "flood", "collapse", "erosion", "storm"}
CATEGORY_CHECK_NOTE = "Brown water can look like flooding or sewage. Category to be checked."
DANGEROUS_WILDLIFE = (
    "tiger",
    "lion",
    "wolf",
    "leopard",
    "cheetah",
    "jaguar",
    "cougar",
    "puma",
    "panther",
    "bear",
    "crocodile",
    "alligator",
    "shark",
    "hippo",
    "hippopotamus",
    "rhino",
    "rhinoceros",
    "buffalo",
    "bison",
    "hyena",
    "wild boar",
    "boar",
    "moose",
    "cobra",
    "python",
    "viper",
    "rattlesnake",
    "elephant",
)
WILDLIFE_MASS_HINTS = (
    "many dead",
    "mass die",
    "die-off",
    "die off",
    "dozens of",
    "hundreds of",
    "fish kill",
    "dead fish",
    "beached",
    "oil-covered",
    "oiled birds",
    "flock of dead",
)
WILDLIFE_NEAR_HINTS = (
    "next to people",
    "beside a person",
    "close to a person",
    "close to people",
    "among people",
    "in the street with",
)
WILDLIFE_ATTACK_PEOPLE_HINTS = (
    "attacking a person",
    "attacking people",
    "charging people",
    "charging a person",
    "mauling",
    "biting a person",
)


def _wildlife_blob(gemini: dict | None, yolo_labels: list | None) -> str:
    detected = []
    for item in (gemini or {}).get("detected") or []:
        if isinstance(item, dict):
            detected.append(str(item.get("label") or ""))
        else:
            detected.append(str(item))
    return " ".join(
        [
            str((gemini or {}).get("narrative") or ""),
            str((gemini or {}).get("wildlife_impact") or ""),
            " ".join(str(label) for label in (yolo_labels or [])),
            " ".join(detected),
        ]
    ).lower()


def wildlife_people_threat(gemini: dict | None, yolo_labels: list | None = None) -> bool:
    """True when a dangerous species could injure a person."""
    if gemini and gemini.get("wildlife_people_threat") is True:
        return True
    blob = _wildlife_blob(gemini, yolo_labels)
    return any(name in blob for name in DANGEROUS_WILDLIFE)


def _wildlife_proximity(gemini: dict | None, blob: str) -> str:
    raw = str((gemini or {}).get("wildlife_proximity") or "").strip().lower().replace(" ", "_")
    if raw in {"attacking", "attack", "charge", "charging"}:
        return "attacking"
    if raw in {"near", "close", "nearby_people"}:
        return "near"
    if raw in {"far", "distant", "spotted"}:
        return "far"
    if raw in {"area", "in_area", "nearby"}:
        return "area"
    if any(hint in blob for hint in WILDLIFE_ATTACK_PEOPLE_HINTS):
        return "attacking"
    if any(hint in blob for hint in WILDLIFE_NEAR_HINTS):
        return "near"
    if "far away" in blob or "in the distance" in blob or "distant" in blob:
        return "far"
    return "area"


def classify_wildlife(gemini: dict | None, yolo_labels: list | None = None) -> dict:
    blob = _wildlife_blob(gemini, yolo_labels)
    threat = wildlife_people_threat(gemini, yolo_labels)
    proximity = _wildlife_proximity(gemini, blob)
    people = bool((gemini or {}).get("people_at_risk"))
    mass = bool((gemini or {}).get("wildlife_mass_harm")) or any(hint in blob for hint in WILDLIFE_MASS_HINTS)
    in_danger = bool((gemini or {}).get("wildlife_in_danger")) or any(
        word in blob for word in ("injured", "trapped", "entangled", "orphaned")
    )
    if threat and (proximity in {"near", "attacking"} or people):
        return {
            "threat": True,
            "proximity": "attacking" if proximity == "attacking" or people else "near",
            "in_danger": in_danger,
            "mass_harm": mass,
            "notice": "stayback",
            "priority": "HIGH",
            "severity": 8.7,
        }
    if threat:
        return {
            "threat": True,
            "proximity": proximity if proximity in {"far", "area"} else "area",
            "in_danger": in_danger,
            "mass_harm": mass,
            "notice": "protect",
            "priority": "MEDIUM",
            "severity": 6.8,
        }
    if mass:
        return {
            "threat": False,
            "proximity": "area",
            "in_danger": True,
            "mass_harm": True,
            "notice": "help",
            "priority": "HIGH",
            "severity": 8.2,
        }
    return {
        "threat": False,
        "proximity": "area",
        "in_danger": in_danger or True,
        "mass_harm": False,
        "notice": "help",
        "priority": "MEDIUM",
        "severity": 6.4,
    }


def _is_stayback(
    photo_kind: str,
    priority: str,
    severity: float,
    *,
    wildlife_notice: str = "",
) -> bool:
    """Stay-back for MEDIUM and HIGH on fire/flood/quake/leak/slide."""
    pri = str(priority or "LOW").upper()
    kind = photo_kind or "unknown"
    score = float(severity or 0)
    if kind == "indoor":
        return False
    if kind == "wildlife":
        return wildlife_notice in {"stayback", "protect"}
    if kind in STAYBACK_KINDS:
        return pri in {"MEDIUM", "HIGH"} or score >= 6
    return False


def _is_severe_scene(
    photo_kind: str,
    priority: str,
    severity: float,
    severe_flag: bool,
    wildlife_threat: bool = False,
) -> bool:
    notice = "stayback" if wildlife_threat else "help"
    return _is_stayback(photo_kind, priority, severity, wildlife_notice=notice)


def build_notice(
    incident_type: str,
    photo_kind: str,
    priority: str,
    type_match: bool,
    severity: float = 0,
    severe_flag: bool = False,
    wildlife_threat: bool = False,
    wildlife_state: dict | None = None,
    category_check: bool = False,
) -> dict:
    """Stay-back vs cleanup vs review comes from how severe the photo is."""
    pri = str(priority or "LOW").upper()
    kind = photo_kind or "unknown"
    state = wildlife_state or {}
    wildlife_notice = state.get("notice") or ("stayback" if wildlife_threat else "")
    if category_check:
        return {
            "notice_kind": "review",
            "notice_title": "Category to be checked",
            "notice_lead": "Flooding and sewage often look the same in a photo — both are usually brown water. This case is filed as the selected category for now. A team will confirm. Avoid contact with the water. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        }
    if kind == "indoor":
        return {
            "notice_kind": "review",
            "notice_title": "Photo under review",
            "notice_lead": "This photo looks like an ordinary indoor scene, so it is not treated as a field emergency. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        }
    if kind == "wildlife":
        if wildlife_notice == "stayback":
            return {
                "notice_kind": "extreme",
                "notice_title": "Stay back",
                "notice_lead": "A dangerous animal is near people or may be attacking. Stay back, protect yourself, and do not approach. If someone is already injured, contact local emergency services first. A wildlife team will be alerted. EarthRelay does not replace emergency response.",
            }
        if wildlife_notice == "protect":
            return {
                "notice_kind": "extreme",
                "notice_title": "Protect yourself",
                "notice_lead": "A dangerous animal has been spotted in the area, even if it looks far away. Protect yourself and choose a safe place to hide or stay indoors. Do not go closer. A wildlife team will be sent. We will contact you if we need more information.",
            }
        if state.get("mass_harm"):
            return {
                "notice_kind": "cleanup",
                "notice_title": "A team is being sent",
                "notice_lead": "Many animals appear to be in danger. A wildlife team will be there as soon as possible. We will contact you if we need more information. Do not try to handle the animals yourself.",
            }
        return {
            "notice_kind": "cleanup",
            "notice_title": "A team is being sent",
            "notice_lead": "A wildlife team will be there to help, and will contact you if needed. Do not try to rescue the animal yourself.",
        }
    extreme = _is_stayback(kind, pri, severity, wildlife_notice=wildlife_notice)
    leads = {
        "fire": "Stay back from the fire and smoke. Do not approach. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        "flood": "Stay out of floodwater and away from the edge. Do not walk or drive through it. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        "collapse": "Stay clear of damaged buildings, walls, and loose debris. Aftershocks may follow. Take the photo from a safe distance. If people are trapped or injured, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        "erosion": "Stay back from unstable slopes, mud, and the edge of the slide. Ground can give way without warning. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        "storm": "Stay away from downed lines, debris, and unstable structures. Take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
    }
    if extreme:
        return {
            "notice_kind": "extreme",
            "notice_title": "Stay back",
            "notice_lead": leads.get(
                kind,
                "This photo looks severe. Stay back, do not try to handle it yourself, and take the photo from a safe distance. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
            ),
        }
    if kind == "unknown" and not type_match:
        return {
            "notice_kind": "review",
            "notice_title": "Photo under review",
            "notice_lead": "The photo did not clearly match the selected category. A team will review it. If people are in immediate danger, contact local emergency services first. EarthRelay files a case; it does not replace emergency response.",
        }
    return {
        "notice_kind": "cleanup",
        "notice_title": "A team is being sent",
        "notice_lead": "A response team will be sent to the site for cleanup or inspection very soon. We will contact you if we need more information.",
    }


def analyze_scene(image_path: Path, yolo_labels: list | None = None) -> dict:
    """Read the photograph. YOLO cannot name fire, smoke, or flood water."""
    labels = [str(label).lower() for label in (yolo_labels or [])]
    fruit = any(label in FRUIT_OR_FOOD for label in labels)
    indoor_objects = indoor_household_scene(labels)
    empty = {
        "kind": "indoor" if indoor_objects else "unknown",
        "confidence": 0.4 if indoor_objects else 0.2,
        "flame_frac": 0.0,
        "smoke_frac": 0.0,
        "water_frac": 0.0,
        "collapse_score": 0.0,
        "findings": [],
    }
    try:
        from PIL import Image, ImageOps

        image = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
        image.thumbnail((240, 240))
        width, height = image.size
        if width < 8 or height < 8:
            return empty
        rgb = image.load()
        hsv = image.convert("HSV").load()
    except Exception:
        return empty

    mid = max(1, height // 2)
    flame = smoke = dark = sky = water_lower = water_upper = smoke_upper = 0
    mud_lower = mud_upper = 0
    total = width * height
    lower_n = width * (height - mid)
    upper_n = width * mid
    for y in range(height):
        for x in range(width):
            red, green, blue = rgb[x, y]
            hue, sat, val = hsv[x, y]
            rf, gf, bf = red / 255.0, green / 255.0, blue / 255.0
            is_flame = (hue <= 22 or hue >= 245) and sat >= 150 and val >= 160 and rf > bf + 0.15 and rf > gf + 0.04
            is_smoke = sat <= 48 and 20 <= val <= 145 and abs(rf - gf) < 0.08 and abs(gf - bf) < 0.08
            if is_flame:
                flame += 1
            if is_smoke:
                smoke += 1
                if y < mid:
                    smoke_upper += 1
            if val < 55:
                dark += 1
            if bf > rf + 0.04 and val >= 140 and sat >= 30 and 85 <= hue <= 175:
                sky += 1
            is_blue_water = blue > red + 25 and blue >= green - 8 and 35 <= val <= 205 and sat <= 180 and 70 <= hue <= 190
            is_mud_water = (
                6 <= hue <= 55
                and 20 <= sat <= 135
                and 40 <= val <= 180
                and abs(rf - gf) < 0.18
                and rf + 0.04 >= bf
                and not is_flame
            )
            if is_blue_water or is_mud_water:
                if y >= mid:
                    water_lower += 1
                else:
                    water_upper += 1
            if is_mud_water:
                if y >= mid:
                    mud_lower += 1
                else:
                    mud_upper += 1

    flame_frac = flame / total
    smoke_frac = smoke / total
    dark_frac = dark / total
    sky_frac = sky / total
    water_lower_f = water_lower / max(1, lower_n)
    water_upper_f = water_upper / max(1, upper_n)
    mud_lower_f = mud_lower / max(1, lower_n)
    smoke_upper_f = smoke_upper / max(1, upper_n)

    kind = "unknown"
    confidence = 0.25
    findings = []

    flood_like = (not fruit) and water_lower_f >= 0.20 and water_lower_f >= water_upper_f * 0.65
    muddy_flood = (not fruit) and mud_lower_f >= 0.14 and mud_lower_f >= water_upper_f * 0.5
    fire_like = mud_lower_f < 0.12 and (
        (flame_frac >= 0.02 and smoke_upper_f >= 0.05) or flame_frac >= 0.045
    )

    if indoor_objects:
        kind = "indoor"
        confidence = 0.7
    elif flood_like or muddy_flood:
        kind = "flood"
        confidence = min(0.92, 0.42 + water_lower_f)
        findings.append(
            {
                "label": "flooding / standing water",
                "source": "scene_vision",
                "confidence": confidence,
                "caveat": "Visual water only. Not a laboratory result.",
            }
        )
    elif fire_like and not fruit:
        kind = "fire"
        confidence = min(0.96, 0.5 + flame_frac * 2.5 + smoke_frac)
        findings.append(
            {
                "label": "active flames" if flame_frac >= 0.04 else "possible fire",
                "source": "scene_vision",
                "confidence": confidence,
            }
        )
        if smoke_frac >= 0.05 or smoke_upper_f >= 0.06:
            findings.append(
                {"label": "smoke plume", "source": "scene_vision", "confidence": min(0.92, 0.45 + smoke_frac)}
            )
    elif sum(1 for label in labels if label == "bottle") >= 3:
        kind = "waste"
        confidence = 0.8
        findings.append({"label": "plastic bottles", "source": "yolo", "confidence": 0.9})

    edges = 0
    edge_n = max(1, (width - 1) * height + width * (height - 1))
    for y in range(height):
        for x in range(width):
            val = hsv[x, y][2]
            if x + 1 < width and abs(val - hsv[x + 1, y][2]) > 28:
                edges += 1
            if y + 1 < height and abs(val - hsv[x, y + 1][2]) > 28:
                edges += 1
    collapse_score = edges / edge_n
    if (
        kind == "unknown"
        and not indoor_objects
        and not fruit
        and flame_frac < 0.02
        and water_lower_f < 0.22
        and collapse_score >= 0.17
        and dark_frac >= 0.12
        and sky_frac < 0.38
    ):
        kind = "collapse"
        confidence = min(0.82, 0.45 + collapse_score)
        findings.append(
            {
                "label": "possible structural damage / collapsed building",
                "source": "scene_vision",
                "confidence": confidence,
            }
        )

    return {
        "kind": kind,
        "confidence": round(confidence, 3),
        "flame_frac": round(flame_frac, 4),
        "smoke_frac": round(smoke_frac, 4),
        "water_frac": round(water_lower_f, 4),
        "collapse_score": round(collapse_score, 4),
        "findings": findings,
    }


FIELD_PHOTO_KINDS = {"fire", "flood", "waste", "collapse", "erosion", "wildlife", "sewage", "storm"}


def resolve_incident_type(
    reporter_type: str,
    scene: dict,
    yolo_labels: list | None = None,
    gemini: dict | None = None,
) -> tuple[str, bool, str]:
    """Photo first. Selected type is kept only if it agrees. Unclear photo uses the category as a hint. Indoor / none → other."""
    reporter = normalize_incident_type(reporter_type or "other")
    kind = (scene or {}).get("kind") or "unknown"
    labels = [str(label).lower() for label in (yolo_labels or [])]
    if indoor_household_scene(labels, kind) and kind not in {"fire", "flood", "collapse"}:
        kind = "indoor"

    gemini_type = normalize_incident_type((gemini or {}).get("incident_type")) if gemini else ""
    gemini_kind = normalize_photo_kind((gemini or {}).get("photo_kind"), gemini_type) if gemini else ""
    if gemini_kind in {"fire", "flood", "waste", "collapse", "indoor", "erosion", "wildlife", "sewage", "storm"}:
        kind = gemini_kind

    if kind == "fire":
        if reporter_family(reporter) == "fire":
            return reporter, True, "The photo matches the selected fire / smoke type."
        return "wildfire_smoke", False, f"The photo shows fire / smoke. Selected “{reporter.replace('_', ' ')}” was ignored."
    if kind == "flood":
        if reporter == "flood_damage":
            return reporter, True, "The photo matches the selected flood type."
        if reporter == "sewage_discharge":
            return "sewage_discharge", False, CATEGORY_CHECK_NOTE
        return "flood_damage", False, f"The photo shows flooding. Selected “{reporter.replace('_', ' ')}” was ignored."
    if kind == "sewage":
        if reporter == "sewage_discharge":
            return reporter, True, "The photo matches the selected sewage type."
        if reporter == "flood_damage":
            return "sewage_discharge", False, CATEGORY_CHECK_NOTE
        return "sewage_discharge", False, f"The photo shows a sewage discharge. Selected “{reporter.replace('_', ' ')}” was ignored."
    if kind == "waste":
        if reporter_family(reporter) == "waste":
            return reporter, True, "The photo supports the selected waste type."
        return "illegal_dumping", False, f"The photo shows dumped waste. Selected “{reporter.replace('_', ' ')}” was ignored."
    if kind == "collapse":
        if reporter_family(reporter) == "earthquake":
            return reporter, True, "The photo matches the selected earthquake / structural damage type."
        return (
            "earthquake",
            False,
            f"The photo shows damaged or collapsed structures. Selected “{reporter.replace('_', ' ')}” was ignored.",
        )
    if kind == "indoor":
        return (
            "other",
            False,
            f"The photo looks like an indoor or ordinary object. Selected “{reporter.replace('_', ' ')}” was not used as the incident type.",
        )
    if kind == "erosion":
        if reporter == "erosion":
            return reporter, True, "The photo matches the selected erosion / mudslide type."
        return "erosion", False, f"The photo shows an unstable slope or mudslide. Selected “{reporter.replace('_', ' ')}” was ignored."
    if kind == "wildlife":
        if reporter == "wildlife":
            return reporter, True, "The photo matches the selected wildlife type."
        return "wildlife", False, f"The photo shows wildlife. Selected “{reporter.replace('_', ' ')}” was ignored."
    if gemini_type and gemini_type != "other":
        matched = gemini_type == reporter or reporter_family(gemini_type) == reporter_family(reporter)
        if matched:
            return reporter if reporter in ALLOWED_TYPES else gemini_type, True, "The photo supports the selected type."
        return (
            gemini_type,
            False,
            f"The photo was classified as {(gemini_type or 'other').replace('_', ' ')}. Selected “{reporter.replace('_', ' ')}” was not used as the incident type.",
        )
    if reporter in ALLOWED_TYPES and reporter != "other":
        return (
            reporter,
            False,
            "The photo was unclear, so the selected category was used as a hint.",
        )
    return (
        "other",
        False,
        f"The photo did not confirm the selected type. Selected “{reporter.replace('_', ' ')}” was not used as the filed incident.",
    )


def field_evidence(yolo_labels: list | None, scene: dict | None = None) -> bool:
    kind = (scene or {}).get("kind")
    if kind in {"fire", "flood", "waste", "collapse"}:
        return True
    labels = [str(label).lower() for label in (yolo_labels or [])]
    if indoor_household_scene(labels, kind):
        return False
    if sum(1 for label in labels if label == "bottle") >= 3:
        return True
    return any(label in FIELD_LABELS or label in YOLO_TO_FINDING for label in labels)


def visual_findings(detection: dict, incident_type: str, scene: dict | None = None) -> list[dict]:
    found = []
    labels = detection.get("labels") or []
    bottle_count = sum(1 for label in labels if label == "bottle")
    kind = (scene or {}).get("kind")
    indoor = indoor_household_scene(labels, kind)
    for item in (scene or {}).get("findings") or []:
        found.append(item)

    for label in labels:
        if label in FRUIT_OR_FOOD:
            found.append(
                {
                    "label": f"{label} (food / fruit)",
                    "source": "yolo",
                    "confidence": 0.9,
                    "caveat": "Food in a photo is not fire, smoke, or an environmental dump.",
                }
            )
            continue
        if label in HOUSEHOLD_LABELS and kind not in {"fire", "flood", "collapse"}:
            found.append(
                {
                    "label": f"{label} (indoor / household object)",
                    "source": "yolo",
                    "confidence": 0.75,
                    "caveat": "Not treated as dumped waste from this photo alone.",
                }
            )
            continue
        if label == "bottle":
            if bottle_count >= 3 and not indoor:
                found.append({"label": "plastic bottles", "source": "yolo", "confidence": 0.9})
            else:
                found.append(
                    {
                        "label": "bottle (not enough to confirm dumping)",
                        "source": "yolo",
                        "confidence": 0.55,
                        "caveat": "A bottle in an indoor or ordinary scene is not scored as a waste incident.",
                    }
                )
            continue
        mapped = YOLO_TO_FINDING.get(label)
        if mapped:
            found.append({"label": mapped, "source": "yolo", "confidence": 0.85})

    has_hazard = any(
        item.get("source") in {"scene_vision", "yolo", "gemini"}
        and "household" not in item.get("label", "")
        and "food / fruit" not in item.get("label", "")
        and "not enough" not in item.get("label", "")
        for item in found
    )
    if kind in {"fire", "flood", "waste", "collapse"}:
        has_hazard = True
    if (indoor and kind not in {"fire", "flood", "collapse"}) or not has_hazard:
        found.append(
            {
                "label": "no environmental hazard confirmed in the photo",
                "source": "visual_review",
                "confidence": 0.35,
                "caveat": f"Reporter selected {incident_type.replace('_', ' ')}. That claim is not used as proof.",
            }
        )
    return sanitize_findings(found, incident_type, labels)


def nearby_context(lat: float | None, lng: float | None) -> dict:
    if lat is None or lng is None:
        return {"protected": [], "wildlife": [], "note": "No coordinates pinned; ecosystem proximity not calculated."}
    protected = []
    for feature in (read_geojson("protected_areas.geojson") or {}).get("features") or []:
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        dist = haversine_m(lat, lng, float(coords[1]), float(coords[0]))
        if dist <= 25000:
            protected.append({"title": (feature.get("properties") or {}).get("title"), "distance_m": round(dist)})
    wildlife = []
    for feature in (read_geojson("wildlife.geojson") or {}).get("features") or []:
        coords = (feature.get("geometry") or {}).get("coordinates") or []
        if len(coords) < 2:
            continue
        dist = haversine_m(lat, lng, float(coords[1]), float(coords[0]))
        if dist <= 50000:
            wildlife.append({"title": (feature.get("properties") or {}).get("title"), "distance_m": round(dist)})
    protected.sort(key=lambda item: item["distance_m"])
    wildlife.sort(key=lambda item: item["distance_m"])
    note = (
        "Nearby ecosystem records are within range of this pin. Confirm on site whether habitat is actually affected."
        if protected or wildlife
        else "No nearby protected-area or wildlife records were found for this pin."
    )
    return {"protected": protected[:6], "wildlife": wildlife[:6], "note": note}


def score_severity(
    findings: list[dict],
    incident_type: str,
    report_count: int,
    weather: dict | None,
    yolo_labels: list | None = None,
    scene: dict | None = None,
    type_match: bool = False,
) -> tuple[float, str, list[str]]:
    reasons = []
    kind = (scene or {}).get("kind") or "unknown"
    indoor = indoor_household_scene(yolo_labels, kind)
    labels = {
        str(item.get("label") or "").lower()
        for item in findings
        if item.get("source") in {"yolo", "gemini", "scene_vision"}
    }
    env_labels = {
        label
        for label in labels
        if "household" not in label and "food / fruit" not in label and "not enough" not in label and "no environmental" not in label
    }

    if kind == "fire":
        score = 8.2
        reasons.append("Photograph shows active fire / smoke")
        if (scene or {}).get("flame_frac", 0) >= 0.06:
            score += 0.8
            reasons.append("Large flame area in the frame")
        if (scene or {}).get("smoke_frac", 0) >= 0.08:
            score += 0.4
            reasons.append("Smoke plume visible")
        if type_match:
            score += 0.3
            reasons.append("Selected type matches the photo")
        wind = (weather or {}).get("wind_kmh") or 0
        if wind >= 15:
            score += 0.5
            reasons.append(f"Wind {wind} km/h may spread fire or smoke")
        score = min(10.0, round(score, 1))
        return score, "HIGH" if score >= 8 else "MEDIUM", reasons

    if kind == "flood":
        score = 8.0
        reasons.append("Photograph shows flooding / standing water")
        if type_match:
            score += 0.4
            reasons.append("Selected type matches the photo")
        rain = (weather or {}).get("rain_next_24h_mm") or 0
        if rain >= 5:
            score += 0.6
            reasons.append("More rain may raise water further")
        score = min(10.0, round(score, 1))
        priority = "HIGH" if score >= 8 else "MEDIUM"
        return score, priority, reasons

    if kind == "sewage":
        score = 6.2
        reasons.append("Photograph shows a possible sewage discharge or brown wastewater")
        if type_match:
            score += 0.3
            reasons.append("Selected type matches the photo")
        score = min(10.0, round(score, 1))
        return score, "MEDIUM", reasons

    if indoor or kind == "indoor":
        score = 1.8
        reasons.append("Photo looks like an indoor or ordinary object, not a confirmed field hazard")
        return 1.8, "LOW", reasons

    if kind == "collapse":
        score = 8.6
        reasons.append("Photograph shows collapsed or badly damaged structures")
        if type_match:
            score += 0.2
            reasons.append("Selected type matches the photo")
        score = min(10.0, round(score, 1))
        return score, "HIGH", reasons

    if kind == "waste":
        score = 6.2
        reasons.append("Photograph shows dumped waste in the field")
        yolo = [str(label).lower() for label in (yolo_labels or [])]
        if any(label in {"person", "child"} for label in yolo) or any(
            "person" in str(item.get("label") or "").lower() for item in findings
        ):
            score = max(score, 7.0)
            reasons.append("People are in or next to the dumped waste")
        if any(label in {"boat"} for label in yolo) or any(
            word in " ".join(env_labels) for word in ("water", "shore", "canal", "river", "flood")
        ):
            score = max(score, 7.2)
            reasons.append("Waste is on a shoreline or in water")
        rain = (weather or {}).get("rain_next_24h_mm") or 0
        if rain >= 5:
            score += 0.4
            reasons.append("Rain may wash debris farther downstream")
        if report_count >= 3:
            score += 0.4
            reasons.append("Multiple citizen reports")
        if type_match:
            score += 0.2
            reasons.append("Selected type matches the photo")
        score = min(10.0, round(score, 1))
        return score, _priority_for(score), reasons

    score = 2.4

    if any("plastic bottle" in label for label in env_labels) or kind == "waste":
        score += 2.2
        reasons.append("Waste indicators in the photo")
    if any("haul" in label or "dump vehicle" in label for label in env_labels):
        score += 1.5
        reasons.append("Haul / dump vehicle visible")
    if any("fire" in label or "smoke" in label or "flame" in label for label in env_labels):
        score += 2.2
        reasons.append("Smoke or fire indicators in the photo")
    if any("pollution" in label or "river" in label or "waterway" in label or "flood" in label for label in env_labels):
        score += 1.4
        reasons.append("Water pathway may be affected")
    if any("wildlife" in label for label in env_labels):
        score += 0.8
        reasons.append("Wildlife visible")
    if type_match and kind in {"waste", "fire", "flood"}:
        score += 0.6
        reasons.append("Selected type matches the photo")
    if any("no environmental hazard" in str(item.get("label") or "").lower() for item in findings):
        reasons.append("Reporter type was not treated as visual proof")
    if report_count >= 3 and not indoor:
        score += 1.2
        reasons.append("Multiple citizen reports")
    wind = (weather or {}).get("wind_kmh") or 0
    rain = (weather or {}).get("rain_next_24h_mm") or 0
    if not indoor and wind >= 15 and any("fire" in label or "smoke" in label for label in env_labels):
        score += 1.0
        reasons.append(f"Wind {wind} km/h may spread smoke or fire")
    if not indoor and rain >= 5 and any("plastic bottle" in label or "dump" in label or kind == "waste" for label in env_labels):
        score += 0.8
        reasons.append("Rain may wash debris farther downstream")

    score = min(10.0, round(score, 1))
    if score >= 8:
        priority = "HIGH"
    elif score >= 6:
        priority = "MEDIUM"
    else:
        priority = "LOW"
    if not reasons:
        reasons.append("No strong visual hazard in the photo")
    return score, priority, reasons


def staff_caveats(items) -> list[str]:
    """Staff-facing limits. Never mention YOLO or other model names."""
    out: list[str] = []
    seen: set[str] = set()
    for raw in items or []:
        if isinstance(raw, dict):
            text = str(raw.get("label") or raw.get("text") or "").strip()
        else:
            text = str(raw or "").strip()
        if not text:
            continue
        if "yolo" in text.lower():
            low = text.lower()
            if any(word in low for word in ("structur", "trapped", "collaps", "victim", "casualt")):
                text = "The photo cannot confirm whether a structure is stable or whether anyone is trapped."
            else:
                text = "The photo cannot prove every detail of what is happening on the ground."
        if text in seen:
            continue
        seen.add(text)
        out.append(text)
    return out


def local_report(
    incident_type: str,
    findings: list[dict],
    weather: dict | None,
    ecosystem: dict,
    report_count: int,
    yolo_labels: list | None = None,
    scene: dict | None = None,
    type_match: bool = False,
    type_note: str = "",
) -> dict:
    pack = pack_for(incident_type)
    kind = (scene or {}).get("kind") or "unknown"
    severity, priority, reasons = score_severity(
        findings, incident_type, report_count, weather, yolo_labels, scene, type_match
    )
    caveats = [
        "This assessment is from photographs and public environmental data. It cannot confirm chemistry, toxicity, pH, or specific pollutants.",
        "Severity is based on what the photo actually shows. The selected incident type is used only when it matches the photo.",
    ]
    if type_note:
        caveats.append(type_note)
    if kind == "collapse":
        caveats.append(
            "The photo cannot confirm whether a structure is stable or whether anyone is trapped."
        )
    caveats = staff_caveats(caveats)
    indoor = indoor_household_scene(yolo_labels, kind) or kind == "indoor"
    shown = ", ".join(item["label"] for item in findings[:4]) or "no confirmed field hazard"
    if kind == "fire":
        narrative = (
            f"The photograph shows fire and/or smoke ({shown}). "
            f"Priority is {priority} (severity {severity}/10). "
            f"{type_note} Do not approach. Alert fire responders."
        )
        scene_label = "fire"
    elif kind == "flood":
        narrative = (
            f"The photograph shows flooding or standing water ({shown}). "
            f"Priority is {priority} (severity {severity}/10). {type_note}"
        )
        scene_label = "flood"
    elif kind == "sewage":
        narrative = (
            f"The photograph shows brown water that may be sewage ({shown}). "
            f"Priority is {priority} (severity {severity}/10). {type_note} Avoid contact with the water."
        )
        scene_label = "sewage"
    elif kind == "collapse":
        narrative = (
            f"The photograph shows collapsed or badly damaged structures ({shown}). "
            f"Priority is {priority} (severity {severity}/10). {type_note} Stay clear of unstable buildings."
        )
        scene_label = "collapse"
    elif indoor:
        narrative = (
            f"The photo looks like an ordinary indoor or household scene ({shown}). "
            f"It is not scored as a severe environmental incident. Priority is {priority} (severity {severity}/10). "
            f"{type_note}"
        )
        scene_label = "indoor_household"
    else:
        narrative = (
            f"Visual review indicates {shown}. "
            f"Priority is {priority} (severity {severity}/10). {type_note} "
            "Do not treat this as a laboratory result."
        )
        scene_label = "field"
    if kind == "fire" and weather:
        narrative += (
            f" Wind is about {weather.get('wind_kmh')} km/h. "
            "Fire or smoke may move with the wind toward nearby vegetation."
        )
    if kind != "fire" and not indoor and weather and (weather.get("rain_next_24h_mm") or 0) >= 3:
        narrative += " Rain in the next day may move waste downstream and increase urgency."
    return {
        "narrative": narrative,
        "detected": findings,
        "severity": severity,
        "priority": priority,
        "priority_reasons": reasons,
        "possible_causes": [] if indoor and kind not in {"fire", "flood", "collapse"} else pack["causes"],
        "environmental_risks": [] if indoor and kind not in {"fire", "flood", "collapse"} else pack["risks"],
        "immediate_actions": pack["immediate"] if kind in {"fire", "flood", "waste", "collapse"} or not indoor else ["Ask the reporter for a wider field photo"],
        "long_term_actions": [] if indoor and kind not in {"fire", "flood", "collapse"} else pack["long_term"],
        "wildlife_impact": ecosystem.get("note") if kind in {"fire", "flood", "waste", "collapse"} or not indoor else "No field ecosystem assessed from this indoor-looking photo.",
        "caveats": caveats,
        "confidence": {item["label"]: round(item.get("confidence", 0.6) * 100) for item in findings},
        "generator": "local",
        "scene": scene_label,
        "photo_kind": kind,
        "type_match": type_match,
        "type_note": type_note,
    }


def _yolo_counts(labels: list | None) -> str:
    counts = Counter(str(label).lower() for label in (labels or []))
    if not counts:
        return "none"
    return ", ".join(f"{name}×{n}" for name, n in counts.most_common(12))


def _gemini_image_bytes(image_path: Path) -> bytes:
    from io import BytesIO
    from PIL import Image, ImageOps

    image = ImageOps.exif_transpose(Image.open(image_path)).convert("RGB")
    image.thumbnail((1600, 1600))
    buf = BytesIO()
    image.save(buf, format="JPEG", quality=88)
    return buf.getvalue()


def _parse_gemini_json(text: str) -> dict | None:
    blob = (text or "").strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    try:
        parsed = json.loads(blob)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        start, end = blob.find("{"), blob.rfind("}")
        if start < 0 or end <= start:
            return None
        try:
            parsed = json.loads(blob[start : end + 1])
        except json.JSONDecodeError:
            return None
        return parsed if isinstance(parsed, dict) else None


def _post_gemini(api_key: str, model: str, payload: dict) -> tuple[dict | None, str]:
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
    request = Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json", "x-goog-api-key": api_key},
        method="POST",
    )
    try:
        with urlopen(request, timeout=50) as response:
            return json.loads(response.read().decode("utf-8")), ""
    except HTTPError as exc:
        detail = ""
        try:
            detail = exc.read().decode("utf-8", errors="replace")[:240]
        except Exception:
            detail = str(exc.reason or exc)
        return None, f"{model} HTTP {exc.code}: {detail or exc.reason}"
    except TimeoutError:
        return None, f"{model} timed out after 50s"
    except (URLError, OSError, json.JSONDecodeError) as exc:
        return None, f"{model} failed: {exc}"


def gemini_report(image_path: Path, context: dict, models: tuple[str, ...] | None = None) -> dict | None:
    api_key = (os.getenv("GEMINI_API_KEY") or "").strip().strip('"').strip("'")
    if not api_key:
        return None
    models = models or GEMINI_FLASH_MODELS
    import base64

    types = ", ".join(ALLOWED_TYPES)
    try:
        raw = _gemini_image_bytes(image_path)
    except Exception:
        raw = Path(image_path).read_bytes()
    yolo = _yolo_counts(context.get("labels") if isinstance(context.get("labels"), list) else [])
    prompt = (
        "You are EarthRelay, an environmental case intelligence system. "
        "First, name the incident from the photograph the way a person would. "
        "Look at the entire frame: ground, water, sky, smoke, debris, buildings, and people. "
        "Brown, muddy, tan, dirty, or foamy water covering land, roads, fields, canals, or buildings may be flooding "
        "OR sewage — both often look brown. Do not call brown water wildfire or waste. "
        "YOLO cannot see collapsed buildings, fire, flood, rubble, or cracks. "
        "A YOLO 'person' does not mean a safe street — judge the structure and debris around them. "
        "Return ONLY JSON with keys: "
        "incident_type, photo_kind, severe (boolean), people_at_risk (boolean), "
        "wildlife_people_threat (boolean), wildlife_proximity (far|area|near|attacking), "
        "wildlife_in_danger (boolean), wildlife_mass_harm (boolean), "
        "narrative, detected (list of {label, confidence 0-1, caveat?}), "
        "severity (number 0-10 with one decimal, e.g. 2.4 or 8.7), "
        "priority (LOW|MEDIUM|HIGH), "
        "priority_reasons (list), possible_causes, environmental_risks, "
        "immediate_actions, long_term_actions, wildlife_impact, caveats (list). "
        "caveats are short limits for organization staff in plain language. "
        "Never mention YOLO, Gemini, model names, or software. "
        f"incident_type MUST be one of: {types}. "
        "photo_kind MUST be one of: fire, flood, waste, collapse, indoor, erosion, wildlife, sewage, storm, unknown. "
        "Score severity from how serious the scene looks, not from the reporter's dropdown. "
        "LOW is about 0-5.9, MEDIUM 6.0-7.9, HIGH 8.0-10. Use the full scale. "
        "Fire, flood, collapsed buildings, and mudslides: use MEDIUM when the scene is real but not a disaster "
        "(small grass fire, modest flooded road, small washout). Use HIGH when people, houses, or a large area are at risk. "
        "LOW only if it is contained and nobody could reasonably be hurt (campfire, tiny puddle). "
        "Do not force every fire or flood to HIGH. "
        "Fog, mountain haze, dust, factory stacks, or city smog with no flames: incident_type other, photo_kind unknown. "
        "That is not wildfire and not a stay-back field emergency. "
        "Winter breath, hill fog, mist, and steam are not wildfire. "
        "wildlife_people_threat=true only if a large or dangerous animal could injure a person "
        "(tiger, lion, wolf, bear, leopard, crocodile, venomous snake, and similar). "
        "wildlife_proximity: far if it is distant but spotted; area if it is somewhere in the area; near if it is close to people; "
        "attacking only if it is attacking or about to attack a person. A lion attacking other wildlife (prey), not people, is area, not attacking. "
        "Far or in-area dangerous animals: priority MEDIUM, severity about 6.5. Near people or attacking people: HIGH, severity 8.5 or above. "
        "Injured, trapped, or otherwise endangered wildlife that is not a threat to people: wildlife_in_danger=true, wildlife_people_threat=false, "
        "priority MEDIUM unless many animals are harmed. "
        "wildlife_mass_harm=true if many animals are in danger or dead (fish kill, oiled birds, die-off). Then priority HIGH. "
        "people_at_risk=true when people are in wreckage, floodwater, fire, a slide, on dumped waste, or next to a dangerous animal — not merely standing near an injured bird. "
        "Collapsed buildings: incident_type earthquake, photo_kind collapse. "
        "Active flames or a smoke plume: incident_type wildfire_smoke, photo_kind fire. "
        "Factory stacks or dust with no big flames: incident_type other, photo_kind unknown. "
        "Standing floodwater, a flooded street, a dirty or foamy river or canal, or a river over its banks: incident_type flood_damage, photo_kind flood. "
        "Sewage: a pipe, manhole, drain, ditch outfall, or sewer line releasing dirty water — incident_type sewage_discharge, photo_kind sewage. "
        "Brown water with no clear river flood and no clear pipe/outfall: do not guess. Use photo_kind unknown. "
        "If the reporter selected sewage_discharge and the water is brown, do not override to flood just because the water is brown. "
        "Oil sheen, a leak, or spilled liquid: incident_type other, photo_kind unknown. Do not invent a chemical class. "
        "Unstable slope or mudslide: erosion, photo_kind erosion. "
        "Piles of plastic, garbage, tires, or dumped waste: incident_type illegal_dumping, photo_kind waste. "
        "A few bags or roadside litter with nobody in the pile: LOW, about 3 to 5.5. "
        "A large dump, waste covering a shoreline, waste in water, or waste next to houses: MEDIUM, about 6.5 to 7.5. "
        "People, especially children, walking through the dump or standing on the waste: at least MEDIUM 7.0; HIGH 8+ if they are in contaminated water or a huge dump beside homes. "
        "Do not score a large inhabited shoreline dump as LOW. "
        "Cleared forest, cut logs, or destroyed habitat: incident_type deforestation. "
        "Wild animals: incident_type wildlife, photo_kind wildlife. "
        "Indoor laptops, phones, furniture, product shots: incident_type other, photo_kind indoor, severe=false, LOW, severity under 3. "
        "Never claim laboratory chemistry, toxicity, pH, or named chemicals. "
        "Never classify by color alone. Blue sky is not a river. Orange fruit is not fire. "
        "Cartoon, clip-art, or animated flames are not a real fire: photo_kind indoor or unknown, severe=false, LOW. "
        "Winter breath, fog, or steam is not wildfire smoke. "
        "Do not treat the reporter's selected incident type as proof of what is in the photo. "
        "If the reporter type does not match the photo, ignore the reporter type. "
        f"Reporter type (not proof): {context.get('incident_type')}. "
        f"YOLO object counts (incomplete, not proof): {yolo}. "
        f"Weather: {context.get('weather')}. "
        f"Ecosystem: {context.get('ecosystem')}."
    )
    parts = [
        {"text": prompt},
        {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(raw).decode("ascii")}},
    ]
    parsed = None
    used_model = ""
    last_error = ""
    for model in models:
        skip_model = False
        for use_json in (True, False):
            if skip_model:
                break
            payload = {
                "contents": [{"parts": parts}],
                "generationConfig": {"temperature": 0.15, "responseMimeType": "application/json"}
                if use_json
                else {"temperature": 0.15},
            }
            body, err = _post_gemini(api_key, model, payload)
            if err:
                last_error = err
                if "HTTP 401" in err or "HTTP 403" in err or "HTTP 404" in err:
                    return {
                        "_failed": True,
                        "flash_error": last_error,
                    }
                continue
            text = (
                (((body.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text")
                or ""
            )
            parsed = _parse_gemini_json(text)
            if parsed:
                used_model = model
                break
            last_error = f"{model} returned text that was not usable JSON."
        if parsed:
            break
    if not parsed:
        return {
            "_failed": True,
            "flash_error": last_error or "Gemini did not return a usable reading of the photo.",
        }
    parsed["generator"] = "gemini"
    parsed["gemini_model"] = used_model
    parsed["gemini_tier"] = "pro" if "pro" in used_model else "flash"
    parsed["incident_type"] = normalize_incident_type(parsed.get("incident_type"))
    parsed["photo_kind"] = normalize_photo_kind(parsed.get("photo_kind"), parsed["incident_type"])
    parsed["people_at_risk"] = bool(parsed.get("people_at_risk"))
    parsed["wildlife_people_threat"] = bool(parsed.get("wildlife_people_threat"))
    parsed["wildlife_in_danger"] = bool(parsed.get("wildlife_in_danger"))
    parsed["wildlife_mass_harm"] = bool(parsed.get("wildlife_mass_harm"))
    parsed["air_breathing_risk"] = False
    if parsed["photo_kind"] != "wildlife":
        parsed["wildlife_people_threat"] = False
        parsed["wildlife_in_danger"] = False
        parsed["wildlife_mass_harm"] = False
        parsed["wildlife_proximity"] = ""
    parsed["severe"] = bool(parsed.get("severe")) or parsed["people_at_risk"]
    try:
        parsed["severity"] = round(max(0.0, min(10.0, float(parsed.get("severity")))), 1)
    except (TypeError, ValueError):
        parsed.pop("severity", None)
    if parsed.get("people_at_risk") and parsed["photo_kind"] not in {"wildlife"}:
        parsed["severe"] = True
        if parsed.get("severity") is not None:
            parsed["severity"] = max(parsed["severity"], 8.5)
        parsed["priority"] = "HIGH"
    return parsed


def _flash_is_weak(gemini: dict | None) -> bool:
    """True when Flash failed, returned unknown, or the reading is too thin to trust."""
    if not gemini or gemini.get("_failed"):
        err = str((gemini or {}).get("flash_error") or "")
        if "HTTP 401" in err or "HTTP 403" in err:
            return False
        return True
    kind = normalize_photo_kind(gemini.get("photo_kind"), gemini.get("incident_type") or "")
    if kind in {"unknown", ""}:
        return True
    if gemini.get("severity") is None:
        return True
    narrative = str(gemini.get("narrative") or "").strip()
    if len(narrative) < 12:
        return True
    detected = gemini.get("detected") or []
    scores = []
    for item in detected:
        if not isinstance(item, dict):
            continue
        try:
            scores.append(float(item.get("confidence") or 0))
        except (TypeError, ValueError):
            continue
    if scores and max(scores) < 0.4:
        return True
    return False


def needs_pro(
    scene: dict | None,
    gemini: dict | None,
    yolo_labels: list | None = None,
    reporter_type: str = "",
) -> bool:
    """Pro when Flash fails, the Flash reading is weak, or photo vs selected type disagree. Indoor / ordinary → skip."""
    kind_local = (scene or {}).get("kind") or "unknown"
    indoor = indoor_household_scene(yolo_labels, kind_local)
    if indoor and kind_local not in {"fire", "flood", "collapse"}:
        return False
    if _flash_is_weak(gemini):
        return True
    kind_ai = normalize_photo_kind(gemini.get("photo_kind"), gemini.get("incident_type") or "")
    if kind_ai == "indoor":
        return False
    reporter_kind = normalize_photo_kind("", reporter_type or "")
    if kind_ai in FIELD_PHOTO_KINDS and reporter_kind in FIELD_PHOTO_KINDS and kind_ai != reporter_kind:
        return True
    serious = {"fire", "flood", "collapse"}
    if kind_local in serious and kind_ai in serious and kind_local != kind_ai:
        return True
    if kind_local in serious and kind_ai not in serious:
        return True
    return False


def score_photo(image_path: Path, context: dict, scene: dict | None = None, yolo_labels: list | None = None) -> dict | None:
    """Flash first. Pro if Flash fails, is weak, or photo vs selected type disagree. Indoor / none stay other."""
    if not has_gemini_key():
        return None
    reporter = str((context or {}).get("incident_type") or "")
    flash = gemini_report(image_path, context, models=GEMINI_FLASH_MODELS)
    if not needs_pro(scene, flash, yolo_labels, reporter_type=reporter):
        return flash
    pro = gemini_report(image_path, context, models=GEMINI_PRO_MODELS)
    if pro and not pro.get("_failed"):
        return pro
    return flash if flash and not flash.get("_failed") else pro or flash


def apply_gemini_scene(scene: dict, gemini: dict | None) -> dict:
    if not gemini:
        return scene
    kind = gemini.get("photo_kind")
    if kind not in {"fire", "flood", "waste", "collapse", "indoor", "erosion", "wildlife", "sewage", "storm"}:
        return scene
    next_scene = {**scene, "kind": kind}
    findings = list(next_scene.get("findings") or [])
    labels_blob = " ".join(str(item.get("label") or "").lower() for item in findings)
    extra = {
        "collapse": ("collapsed or badly damaged structure", ("structural", "collapse")),
        "flood": ("flooding / standing water", ("flood", "standing water")),
        "sewage": ("sewage discharge / wastewater", ("sewage", "wastewater", "outfall")),
        "fire": ("active fire / smoke", ("fire", "flame", "smoke")),
    }.get(kind)
    if extra:
        label, hints = extra
        if not any(hint in labels_blob for hint in hints):
            findings.append({"label": label, "source": "gemini", "confidence": 0.9})
            next_scene["findings"] = findings
    return next_scene


def has_gemini_key() -> bool:
    return bool((os.getenv("GEMINI_API_KEY") or "").strip().strip('"').strip("'"))


def should_call_gemini(scene: dict, yolo_labels: list | None) -> bool:
    if not has_gemini_key():
        return False
    indoor = indoor_household_scene(yolo_labels, (scene or {}).get("kind"))
    if indoor and (scene or {}).get("kind") not in {"fire", "flood", "collapse"}:
        return False
    return True


def unwrap_gemini(result: dict | None) -> tuple[dict | None, str]:
    if not result:
        return None, "Gemini Flash did not score this photo."
    if result.get("_failed"):
        return None, str(result.get("flash_error") or "Gemini Flash did not score this photo.")
    return result, ""


def attach_reporter_notes(report: dict, notes: str | None) -> dict:
    """Keep citizen notes off the file unless they actually wrote something."""
    text = str(notes or "").strip()
    if not text:
        report["reporter_notes"] = ""
        report["reporter_mention"] = ""
        return report
    mention = f"The reporter also mentioned: {text}"
    report["reporter_notes"] = text
    report["reporter_mention"] = mention
    narrative = str(report.get("narrative") or "").strip()
    if mention.lower() not in narrative.lower():
        report["narrative"] = f"{narrative} {mention}".strip() if narrative else mention
    return report


async def build_full_report(
    *,
    image_path: Path,
    detection: dict,
    incident_type: str,
    lat: float | None,
    lng: float | None,
    weather: dict | None,
    report_count: int,
    scene: dict | None = None,
    type_match: bool = False,
    type_note: str = "",
    reporter_type: str | None = None,
    gemini: dict | None = None,
    reporter_notes: str = "",
    merged_other_reporter: bool = False,
) -> dict:
    yolo_labels = detection.get("labels") or []
    scene = scene or analyze_scene(image_path, yolo_labels)
    indoor = indoor_household_scene(yolo_labels, scene.get("kind"))
    flash_status = "local"
    flash_error = ""
    if not has_gemini_key():
        flash_error = "Gemini API key is not loaded, so the photo was named with on-device review only."
    if gemini and gemini.get("_failed"):
        flash_error = str(gemini.get("flash_error") or "Gemini Flash did not score this photo.")
        gemini = None
    elif gemini is None and should_call_gemini(scene, yolo_labels):
        raw = score_photo(
            image_path,
            {
                "incident_type": reporter_type or incident_type,
                "labels": yolo_labels,
                "weather": weather,
                "ecosystem": nearby_context(lat, lng) if lat is not None and lng is not None else {},
            },
            scene,
            yolo_labels,
        )
        gemini, flash_error = unwrap_gemini(raw)
        flash_status = "gemini" if gemini else "local"
    elif gemini:
        gemini, flash_error = unwrap_gemini(gemini)
        flash_status = "gemini" if gemini else "local"
    if gemini:
        flash_status = "gemini"
    scene = apply_gemini_scene(scene, gemini)
    resolved, matched, note = resolve_incident_type(reporter_type or incident_type, scene, yolo_labels, gemini)
    incident_type = resolved
    type_match = matched if reporter_type is not None else type_match
    type_note = note or type_note
    findings = visual_findings(detection, incident_type, scene)
    ecosystem = nearby_context(lat, lng)
    indoor = indoor_household_scene(yolo_labels, scene.get("kind"))
    local = local_report(
        incident_type,
        findings,
        weather,
        ecosystem,
        report_count,
        yolo_labels,
        scene,
        type_match,
        type_note,
    )
    report = {**local, **(gemini or {})}
    report["ecosystem"] = ecosystem
    report["weather"] = weather
    report["yolo"] = {
        "count": detection.get("count"),
        "labels": yolo_labels,
        "model": detection.get("model"),
        "device": detection.get("device"),
    }
    merged = list(report.get("detected") or findings)
    have = {str(item.get("label") if isinstance(item, dict) else item).lower() for item in merged}
    for item in findings:
        if item.get("source") in {"yolo", "scene_vision", "gemini"} and item["label"].lower() not in have:
            merged.append(item)
    report["detected"] = sanitize_findings(merged, incident_type, yolo_labels)
    if not report["detected"]:
        report["detected"] = visual_findings(detection, incident_type, scene)
    report["confidence"] = {
        item["label"]: round(item.get("confidence", 0.6) * 100)
        for item in report["detected"]
        if isinstance(item, dict) and item.get("label")
    }
    local_text = local_report(
        incident_type,
        report["detected"],
        weather,
        ecosystem,
        report_count,
        yolo_labels,
        scene,
        type_match,
        type_note,
    )["narrative"]
    gemini_text = ((gemini or {}).get("narrative") or "").strip()
    false_water_story = incident_type in FIRE_TYPES and any(hint in gemini_text.lower() for hint in WATER_LABEL_HINTS)
    report["narrative"] = (
        gemini_text
        if gemini_text and not indoor and not false_water_story
        else local_text
    )
    if merged_other_reporter and report_count > 1:
        extra = report_count - 1
        kind_word = "earthquake" if incident_type == "earthquake" else (incident_type or "incident").replace("_", " ")
        if extra == 1:
            report["duplicate_note"] = (
                f"Another report of this same {kind_word} was already filed nearby. "
                "This photo was added to that case."
            )
        else:
            report["duplicate_note"] = (
                f"{extra} other reports of this same {kind_word} were already filed nearby. "
                "This photo was added to that case."
            )
    else:
        report["duplicate_note"] = ""
    severity, priority, reasons = score_severity(
        report.get("detected") or findings,
        incident_type,
        report_count,
        weather,
        yolo_labels,
        scene,
        type_match,
    )
    if gemini and gemini.get("severity") is not None and not (indoor and scene.get("kind") not in {"fire", "flood", "collapse"}):
        severity = float(gemini["severity"])
        severe_flag = bool(gemini.get("severe"))
        severity = round(max(0.0, min(10.0, severity)), 1)
        priority = _priority_for(severity)
        gemini_reasons = gemini.get("priority_reasons")
        if isinstance(gemini_reasons, list) and gemini_reasons:
            reasons = [str(item) for item in gemini_reasons if item]
        reasons = reasons or ["Scored from the photograph by Gemini Flash"]
        if "Gemini Flash" not in " ".join(reasons):
            reasons.append("Scored from the photograph by Gemini Flash")
    else:
        severe_flag = bool((gemini or {}).get("severe"))
    photo_kind_early = normalize_photo_kind(
        (gemini or {}).get("photo_kind") or scene.get("kind") or "unknown",
        incident_type,
    )
    if photo_kind_early == "waste" and not indoor:
        yolo = [str(label).lower() for label in (yolo_labels or [])]
        blob = " ".join(
            [
                str((gemini or {}).get("narrative") or ""),
                " ".join(str(item.get("label") or "") for item in (report.get("detected") or findings or [])),
            ]
        ).lower()
        floor = 6.2
        bump = ["Field dumping is at least MEDIUM when the photo shows a real waste pile"]
        if any(label in {"person", "child"} for label in yolo) or "person" in blob or "child" in blob or "walking" in blob:
            floor = max(floor, 7.0)
            bump.append("People are in or on the dumped waste")
        if any(word in blob for word in ("shore", "water", "canal", "river", "boat", "flood")) or "boat" in yolo:
            floor = max(floor, 7.2)
            bump.append("Waste is on a shoreline or in water")
        if float(severity) < floor:
            severity = floor
            priority = _priority_for(severity)
            reasons = bump + [item for item in reasons if item not in bump]
    report["severity"] = severity
    report["priority"] = priority
    report["priority_reasons"] = reasons
    report["incident_type"] = incident_type
    report["reporter_type"] = reporter_type or incident_type
    report["type_match"] = type_match
    report["type_note"] = type_note
    photo_kind = normalize_photo_kind(
        (gemini or {}).get("photo_kind") or scene.get("kind") or "unknown",
        incident_type,
    )
    category_check = CATEGORY_CHECK_NOTE in (type_note or "")
    if incident_type == "sewage_discharge" and photo_kind == "flood":
        photo_kind = "sewage"
    report["photo_kind"] = photo_kind
    report["scene"] = local["scene"]
    if category_check:
        report["severity"] = min(float(report.get("severity") or 6.2), 6.5)
        report["priority"] = "MEDIUM"
        report["scene"] = "sewage"
    if indoor and scene.get("kind") not in {"fire", "flood", "collapse", "sewage"} and not severe_flag and not category_check:
        report["severity"] = min(float(report["severity"]), 3.2)
        report["priority"] = "LOW"
        report["emergency"] = False
        report["scene"] = "indoor_household"
        photo_kind = "indoor"
        report["photo_kind"] = "indoor"
    wildlife_state = classify_wildlife(gemini, yolo_labels) if photo_kind == "wildlife" else {}
    if photo_kind == "wildlife" and wildlife_state:
        report["priority"] = wildlife_state["priority"]
        report["severity"] = wildlife_state["severity"]
        report["wildlife_people_threat"] = wildlife_state["threat"]
        report["wildlife_proximity"] = wildlife_state["proximity"]
        report["wildlife_in_danger"] = wildlife_state["in_danger"]
        report["wildlife_mass_harm"] = wildlife_state["mass_harm"]
    else:
        report["wildlife_people_threat"] = False
    report["air_breathing_risk"] = False
    stayback = _is_stayback(
        photo_kind,
        report["priority"],
        report["severity"],
        wildlife_notice=wildlife_state.get("notice") or "",
    )
    report["severe"] = stayback
    report["emergency"] = stayback or (photo_kind == "wildlife" and report["priority"] == "HIGH")
    report.update(
        build_notice(
            incident_type,
            photo_kind,
            report["priority"],
            type_match,
            report["severity"],
            report["severe"],
            bool(wildlife_state.get("threat")),
            wildlife_state,
            category_check,
        )
    )
    people_at_risk = bool((gemini or {}).get("people_at_risk"))
    report["people_at_risk"] = people_at_risk
    force_stayback = people_at_risk and photo_kind not in {"indoor", "wildlife"}
    if photo_kind == "wildlife" and wildlife_state.get("notice") == "stayback":
        force_stayback = True
    if force_stayback and report.get("notice_kind") != "extreme":
        report["emergency"] = True
        report["severe"] = True
        extra = "People appear to be in this scene. Contact local emergency services first. "
        lead = report.get("notice_lead") or ""
        if "People appear" not in lead:
            report["notice_lead"] = extra + lead
        report["notice_kind"] = "extreme"
        report["notice_title"] = "Stay back"
    report["flash_status"] = flash_status
    if gemini:
        report["gemini_tier"] = gemini.get("gemini_tier") or (
            "pro" if "pro" in str(gemini.get("gemini_model") or "") else "flash"
        )
        report["gemini_model"] = gemini.get("gemini_model") or ""
    if flash_error and flash_status != "gemini":
        report["flash_error"] = flash_error
    report["generator"] = "gemini" if gemini else local.get("generator") or "local"
    report["caveats"] = staff_caveats(report.get("caveats"))
    attach_reporter_notes(report, reporter_notes)
    return report


def case_title(incident_type: str, detection: dict, report: dict | None = None) -> str:
    type_label = (incident_type or "incident").replace("_", " ")
    kind = (report or {}).get("photo_kind") or (report or {}).get("scene")
    if kind == "fire":
        return "wildfire / smoke — active fire"
    if kind == "flood":
        return "flooding — standing water"
    if kind == "sewage" or incident_type == "sewage_discharge":
        if report and not report.get("type_match"):
            return "sewage discharge — category to be checked"
        return "sewage discharge"
    if kind == "collapse" or incident_type == "earthquake":
        return "earthquake — structural damage"
    yolo = [str(label).lower() for label in (detection.get("labels") or [])]
    if indoor_household_scene(yolo, kind) or kind == "indoor_household" or kind == "indoor":
        return f"{type_label} — photo needs review"
    if kind not in {"waste", "collapse", "fire", "flood"} and not field_evidence(yolo, {"kind": kind} if kind else None):
        return f"{type_label} — photo needs review"
    shown = []
    for label in yolo:
        if label in HOUSEHOLD_LABELS or label in FRUIT_OR_FOOD or label in NEUTRAL_LABELS:
            continue
        if label not in shown:
            shown.append(label)
        if len(shown) == 3:
            break
    if not shown:
        return f"{type_label} — photo needs review"
    extra = ", ".join(shown)
    if extra == type_label:
        return type_label
    return f"{type_label} — {extra}"
