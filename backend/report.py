"""Full environmental case intelligence report.

YOLO names objects it actually knows (bottles, trucks, wildlife). Gemini, when
configured, reads the photograph. Pixel color is never treated as a class:
blue sky is not a river, and an orange fruit is not fire.
"""

from __future__ import annotations

import json
import math
import os
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request, urlopen

from net import read_geojson

GEMINI_URL = (
    "https://generativelanguage.googleapis.com/v1beta/models/"
    "gemini-2.0-flash:generateContent"
)

YOLO_TO_FINDING = {
    "bottle": "plastic bottles",
    "cup": "possible plastic waste",
    "bowl": "possible waste",
    "backpack": "dumped belongings",
    "suitcase": "dumped goods",
    "handbag": "dumped belongings",
    "tv": "possible e-waste",
    "laptop": "possible e-waste",
    "cell phone": "possible e-waste",
    "microwave": "possible e-waste",
    "oven": "possible e-waste",
    "refrigerator": "possible e-waste",
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
    "potted plant": "vegetation",
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
}


def haversine_m(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius = 6371000
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * radius * math.asin(math.sqrt(a))


FRUIT_OR_FOOD = {"orange", "apple", "banana", "carrot", "pizza", "donut", "cake", "sandwich", "hot dog"}
FIRE_TYPES = {"wildfire_smoke", "grass_fire", "factory_smoke", "burning_trash"}
WATER_TYPES = {
    "water_pollution",
    "oil_spill",
    "sewage_discharge",
    "flood_damage",
    "river_overflow",
    "urban_flooding",
}
WATER_LABEL_HINTS = ("river", "water body", "waterway", "lake", "stream", "ocean", "sea")


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
        if _is_water_label(lower):
            if incident_type in FIRE_TYPES and not saw_boat:
                continue
            if incident_type not in WATER_TYPES and not saw_boat and item.get("source") != "gemini":
                continue
        cleaned.append(item)
    unique = {}
    for item in cleaned:
        unique[item["label"]] = item
    return list(unique.values())


def visual_findings(detection: dict, incident_type: str) -> list[dict]:
    found = []
    labels = detection.get("labels") or []
    for label in labels:
        if label in FRUIT_OR_FOOD:
            found.append(
                {
                    "label": f"{label} (food / fruit)",
                    "source": "yolo",
                    "confidence": 0.9,
                }
            )
            continue
        mapped = YOLO_TO_FINDING.get(label)
        if mapped:
            found.append({"label": mapped, "source": "yolo", "confidence": 0.85})
        if label == "bottle":
            found.append({"label": "plastic bottles", "source": "yolo", "confidence": 0.9})

    pack = INCIDENT_PACKS.get(incident_type) or INCIDENT_PACKS.get("illegal_dumping")
    if not found:
        for item in pack["findings"]:
            found.append(
                {
                    "label": item,
                    "source": "reporter_type",
                    "confidence": 0.5,
                    "caveat": "From the incident type you selected, not from pixel color.",
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
        "Nearby ecosystem may contain fish, turtles, water birds, and amphibians that could be affected."
        if protected or wildlife or True
        else ""
    )
    return {"protected": protected[:6], "wildlife": wildlife[:6], "note": note}


def score_severity(findings: list[dict], incident_type: str, report_count: int, weather: dict | None) -> tuple[float, str, list[str]]:
    reasons = []
    score = 4.0
    labels = {item["label"] for item in findings}
    if any("dump" in label or "plastic" in label or "waste" in label for label in labels):
        score += 1.5
        reasons.append("Waste / dumping indicators in the scene")
    if any("fire" in label or "smoke" in label or "flame" in label for label in labels):
        score += 2.2
        reasons.append("Smoke or fire indicators")
    if any("pollution" in label or "river" in label or "water" in label for label in labels):
        score += 1.4
        reasons.append("River / water pathway may be affected")
    if report_count >= 3:
        score += 1.2
        reasons.append("Multiple citizen reports")
    wind = (weather or {}).get("wind_kmh") or 0
    rain = (weather or {}).get("rain_next_24h_mm") or 0
    if wind >= 15 and any("fire" in label or "smoke" in label for label in labels):
        score += 1.0
        reasons.append(f"Wind {wind} km/h may spread smoke or fire")
    if rain >= 5 and any("waste" in label or "plastic" in label or "dump" in label for label in labels):
        score += 0.8
        reasons.append("Rain may wash debris farther downstream")
    score = min(10.0, round(score, 1))
    if score >= 8:
        priority = "HIGH"
    elif score >= 6:
        priority = "MEDIUM"
    else:
        priority = "LOW"
    return score, priority, reasons


def local_report(incident_type: str, findings: list[dict], weather: dict | None, ecosystem: dict, report_count: int) -> dict:
    pack = INCIDENT_PACKS.get(incident_type) or INCIDENT_PACKS["illegal_dumping"]
    severity, priority, reasons = score_severity(findings, incident_type, report_count, weather)
    caveats = [
        "This assessment is from photographs and public environmental data. It cannot confirm chemistry, toxicity, pH, or specific pollutants.",
        "Possible water pollution, if listed, is a visual indicator only. Laboratory testing is required for confirmation.",
    ]
    narrative = (
        f"Visual review indicates {', '.join(item['label'] for item in findings[:4]) or 'an environmental incident'}. "
        f"Priority is {priority} (severity {severity}/10). "
        "Do not treat this as a laboratory result."
    )
    if weather and any("fire" in item["label"] or "smoke" in item["label"] for item in findings):
        narrative += (
            f" Wind is about {weather.get('wind_kmh')} km/h. "
            "Fire or smoke may move with the wind toward nearby vegetation."
        )
    if weather and (weather.get("rain_next_24h_mm") or 0) >= 3:
        narrative += " Rain in the next day may move waste downstream and increase urgency."
    return {
        "narrative": narrative,
        "detected": findings,
        "severity": severity,
        "priority": priority,
        "priority_reasons": reasons,
        "possible_causes": pack["causes"],
        "environmental_risks": pack["risks"],
        "immediate_actions": pack["immediate"],
        "long_term_actions": pack["long_term"],
        "wildlife_impact": ecosystem.get("note"),
        "caveats": caveats,
        "confidence": {item["label"]: round(item.get("confidence", 0.6) * 100) for item in findings},
        "generator": "local",
    }


def gemini_report(image_path: Path, context: dict) -> dict | None:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return None
    import base64

    raw = Path(image_path).read_bytes()
    payload = {
        "contents": [
            {
                "parts": [
                    {
                        "text": (
                            "You are EarthRelay, an environmental case intelligence system. "
                            "Analyze the photo. Return ONLY JSON with keys: "
                            "narrative, detected (list of {label, confidence 0-1, caveat?}), "
                            "severity (0-10 number), priority (LOW|MEDIUM|HIGH), "
                            "priority_reasons (list), possible_causes, environmental_risks, "
                            "immediate_actions, long_term_actions, wildlife_impact, caveats (list). "
                            "Never claim laboratory chemistry, toxicity, pH, or named chemicals. "
                            "Never classify by color alone. Blue sky, haze, and distant mountains are not a river. "
                            "Orange fruit, sunsets, autumn leaves, and orange clothing are not fire. "
                            "Only mention water if a river, lake, sea, or shoreline is clearly visible as water. "
                            "Only mention fire or smoke if flames, burn scar, or a smoke plume is actually in the photo. "
                            "If water looks polluted, say possible water pollution and that lab testing is required. "
                            f"Reporter type: {context.get('incident_type')}. "
                            f"YOLO objects: {context.get('labels')}. "
                            f"Weather: {context.get('weather')}. "
                            f"Ecosystem: {context.get('ecosystem')}."
                        )
                    },
                    {"inlineData": {"mimeType": "image/jpeg", "data": base64.b64encode(raw).decode("ascii")}},
                ]
            }
        ]
    }
    request = Request(
        f"{GEMINI_URL}?key={api_key}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urlopen(request, timeout=45) as response:
            body = json.loads(response.read().decode("utf-8"))
    except (URLError, TimeoutError, OSError, json.JSONDecodeError):
        return None
    text = (
        (((body.get("candidates") or [{}])[0].get("content") or {}).get("parts") or [{}])[0].get("text")
        or ""
    )
    text = text.strip().removeprefix("```json").removesuffix("```").strip()
    try:
        parsed = json.loads(text)
    except json.JSONDecodeError:
        return None
    parsed["generator"] = "gemini"
    return parsed


async def build_full_report(
    *,
    image_path: Path,
    detection: dict,
    incident_type: str,
    lat: float | None,
    lng: float | None,
    weather: dict | None,
    report_count: int,
) -> dict:
    yolo_labels = detection.get("labels") or []
    findings = visual_findings(detection, incident_type)
    ecosystem = nearby_context(lat, lng)
    local = local_report(incident_type, findings, weather, ecosystem, report_count)
    gemini = gemini_report(
        image_path,
        {
            "incident_type": incident_type,
            "labels": yolo_labels,
            "weather": weather,
            "ecosystem": ecosystem,
        },
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
        if item["source"] == "yolo" and item["label"].lower() not in have:
            merged.append(item)
    report["detected"] = sanitize_findings(merged, incident_type, yolo_labels)
    if not report["detected"]:
        report["detected"] = visual_findings(detection, incident_type)
    report["confidence"] = {
        item["label"]: round(item.get("confidence", 0.6) * 100)
        for item in report["detected"]
        if isinstance(item, dict) and item.get("label")
    }
    local_text = local_report(incident_type, report["detected"], weather, ecosystem, report_count)["narrative"]
    gemini_text = ((gemini or {}).get("narrative") or "").strip()
    false_water_story = incident_type in FIRE_TYPES and any(hint in gemini_text.lower() for hint in WATER_LABEL_HINTS)
    report["narrative"] = local_text if (not gemini_text or false_water_story) else gemini_text
    if report_count > 1:
        report["duplicate_note"] = (
            f"{report_count} similar reports have already been submitted within 300 meters. "
            "This photo was added to the existing case instead of opening a new incident."
        )
    severity, priority, reasons = score_severity(report.get("detected") or findings, incident_type, report_count, weather)
    report["severity"] = report.get("severity") or severity
    report["priority"] = report.get("priority") or priority
    if not report.get("priority_reasons"):
        report["priority_reasons"] = reasons
    report["emergency"] = str(report.get("priority", "")).upper() == "HIGH"
    return report
