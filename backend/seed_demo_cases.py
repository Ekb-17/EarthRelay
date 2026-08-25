"""Seed a realistic demo inbox so landing stats are never empty.

Run: python backend/seed_demo_cases.py
Also called automatically when backend/data/cases/ has no JSON files.
"""

from __future__ import annotations

import json
import random
import shutil
from datetime import datetime, timedelta, timezone
from pathlib import Path

from routing import route_for

BACKEND = Path(__file__).resolve().parent
CASES_DIR = BACKEND / "data" / "cases"
UPLOAD_DIR = BACKEND / "data" / "uploads"
EVAL_PHOTOS = BACKEND / "eval" / "photos"

CITIES = [
    ("Karachi", 24.8607, 67.0011),
    ("Lahore", 31.5204, 74.3587),
    ("Islamabad", 33.6844, 73.0479),
    ("Peshawar", 34.0151, 71.5249),
    ("Quetta", 30.1798, 66.9750),
    ("Multan", 30.1575, 71.5249),
    ("Faisalabad", 31.4504, 73.1350),
    ("Hyderabad", 25.3960, 68.3578),
    ("Sukkur", 27.7132, 68.8480),
    ("Gilgit", 35.9208, 74.3144),
    ("Muzaffarabad", 34.3700, 73.4711),
    ("Thatta", 24.7475, 67.9106),
]

# incident_type, photo_kind, title stem, kind label for narrative
SPECS = [
    ("flood_damage", "flood", "Street flooding", 24),
    ("urban_flooding", "flood", "Urban floodwater", 8),
    ("river_overflow", "flood", "River overflow", 6),
    ("wildfire_smoke", "fire", "Wildfire smoke", 14),
    ("grass_fire", "fire", "Grass fire", 8),
    ("illegal_dumping", "waste", "Illegal dumping", 18),
    ("overflowing_garbage", "waste", "Overflowing waste", 8),
    ("sewage_discharge", "sewage", "Sewage discharge", 14),
    ("erosion", "erosion", "Erosion / mudslide", 14),
    ("wildlife", "wildlife", "Wildlife incident", 10),
    ("deforestation", "deforestation", "Forest clearing", 8),
    ("earthquake", "collapse", "Structural collapse", 8),
]

KIND_CONF = {
    "flood": (82, 94),
    "fire": (80, 93),
    "waste": (76, 90),
    "collapse": (78, 91),
    "sewage": (68, 84),
    "erosion": (70, 86),
    "wildlife": (72, 88),
    "deforestation": (70, 85),
}

FIRST = ["Ayesha", "Hassan", "Fatima", "Omar", "Zainab", "Ali", "Sara", "Bilal", "Noor", "Usman"]
LAST = ["Khan", "Ahmed", "Malik", "Hussain", "Raza", "Iqbal", "Sheikh", "Butt", "Qureshi", "Shah"]


def _expand_specs() -> list[tuple[str, str, str]]:
    rows = []
    for incident, kind, stem, count in SPECS:
        rows.extend([(incident, kind, stem)] * count)
    return rows


def _iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat()


def _photo_candidates() -> dict[str, list[Path]]:
    found: dict[str, list[Path]] = {}
    if not EVAL_PHOTOS.is_dir():
        return found
    for folder in ("flood", "fire", "waste", "sewage", "erosion", "wildlife", "deforestation", "collapse"):
        folder_dir = EVAL_PHOTOS / folder
        if not folder_dir.is_dir():
            continue
        found[folder] = [
            path
            for path in folder_dir.iterdir()
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp"}
        ]
    return found


def seed_demo_cases(*, force: bool = False) -> int:
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    existing = list(CASES_DIR.glob("*.json"))
    if existing and not force:
        return 0

    rng = random.Random(1042)
    rows = _expand_specs()
    rng.shuffle(rows)
    total = len(rows)
    photos = _photo_candidates()
    now = datetime.now(timezone.utc)

    # 14 pending, 90 investigating, 23 cleanup, 13 resolved → 127 active
    statuses = (
        ["pending"] * 14
        + ["under_investigation"] * 90
        + ["cleanup_scheduled"] * 23
        + ["resolved"] * 13
    )
    while len(statuses) < total:
        statuses.append("under_investigation")
    statuses = statuses[:total]

    high_idx = set(range(0, 38))
    medium_idx = set(range(38, 88))

    written = 0
    for index, ((incident, kind, stem), status) in enumerate(zip(rows, statuses)):
        city, base_lat, base_lng = CITIES[index % len(CITIES)]
        lat = round(base_lat + rng.uniform(-0.18, 0.18), 5)
        lng = round(base_lng + rng.uniform(-0.18, 0.18), 5)
        case_id = f"s{index + 1:04d}"
        display_id = f"ER-{index + 1:05d}"
        created = now - timedelta(hours=rng.randint(2, 240), minutes=rng.randint(0, 50))
        routed = route_for(incident)
        if index in high_idx:
            priority = "HIGH"
            severity = round(rng.uniform(7.4, 9.2), 1)
        elif index in medium_idx:
            priority = "MEDIUM"
            severity = round(rng.uniform(4.6, 6.8), 1)
        else:
            priority = "LOW"
            severity = round(rng.uniform(2.4, 4.2), 1)
        lo, hi = KIND_CONF.get(kind, (70, 85))
        confidence = rng.randint(lo, hi)
        first = FIRST[index % len(FIRST)]
        last = LAST[(index * 3) % len(LAST)]
        report_count = 1 if rng.random() > 0.22 else rng.randint(2, 5)
        image_url = ""
        original_name = ""
        pool = photos.get(kind) or []
        if pool and index < 12:
            src = pool[index % len(pool)]
            dest = UPLOAD_DIR / f"{case_id}_original{src.suffix.lower()}"
            try:
                shutil.copyfile(src, dest)
                image_url = f"/uploads/{dest.name}"
                original_name = src.name
            except OSError:
                image_url = ""
        case = {
            "demo": True,
            "id": case_id,
            "display_id": display_id,
            "title": f"{stem} — {city}",
            "incident_type": incident,
            "status": status,
            "priority": priority,
            "assigned_team": routed["id"],
            "routed_to": routed["id"],
            "routed_label": routed["label"],
            "reporter_role": "citizen",
            "reporter_name": f"{first} {last}",
            "first_name": first,
            "last_name": last,
            "phone": "" if rng.random() < 0.35 else f"03{rng.randint(10, 49)}{rng.randint(1000000, 9999999)}",
            "notes": "",
            "lat": lat,
            "lng": lng,
            "address": f"{city}, Pakistan",
            "nearby": [],
            "location_parts": {"city": city, "state": "Pakistan"},
            "claimed_by": "" if status == "pending" else f"{LAST[index % len(LAST)]} desk",
            "claimed_at": None if status == "pending" else _iso(created + timedelta(hours=2)),
            "location_source": "gps",
            "location_accuracy_m": rng.randint(12, 180),
            "activity": [],
            "created_at": _iso(created),
            "updated_at": _iso(created + timedelta(hours=rng.randint(1, 12))),
            "original_name": original_name,
            "image_url": image_url,
            "annotated_url": "",
            "detection": {"model": "seed", "count": 0, "labels": [], "summary": ""},
            "report": {
                "photo_kind": kind,
                "scene": kind,
                "incident_type": incident,
                "severity": severity,
                "priority": priority,
                "confidence": {stem.lower(): confidence},
                "narrative": f"{stem} reported near {city}.",
                "immediate_actions": [f"Dispatch the {routed['label']}."],
                "emergency": priority == "HIGH",
                "flash_status": "local",
                "generator": "seed",
            },
            "report_count": report_count,
            "reports": [],
            "timeline": [
                {
                    "at": _iso(created),
                    "status": "pending",
                    "detail": f"citizen submitted evidence. Auto-forwarded to {routed['label']}.",
                }
            ],
            "seeded": True,
        }
        (CASES_DIR / f"{case_id}.json").write_text(json.dumps(case, indent=2), encoding="utf-8")
        written += 1
    return written


def seed_if_empty() -> int:
    CASES_DIR.mkdir(parents=True, exist_ok=True)
    if any(CASES_DIR.glob("*.json")):
        return 0
    return seed_demo_cases()


if __name__ == "__main__":
    n = seed_demo_cases(force=True)
    print(f"Wrote {n} demo cases to {CASES_DIR}")
