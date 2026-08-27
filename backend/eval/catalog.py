"""Catalog EarthRelay gold photos under backend/eval/photos.

Folder name is the true class for normal folders. The hard/ folder uses
filename tags like fire-NONE-1.png (looks like fire, true label is none).
"""

from __future__ import annotations

import csv
import re
from pathlib import Path

EVAL_DIR = Path(__file__).resolve().parent
PHOTOS_DIR = EVAL_DIR / "photos"
LABELS_PATH = EVAL_DIR / "labels.csv"

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp", ".bmp"}

# Folder → photo_kind used by report.py
FOLDER_KIND = {
    "flood": "flood",
    "fire": "fire",
    "sewage": "sewage",
    "waste": "waste",
    "collapse": "collapse",
    "erosion": "erosion",
    "deforestation": "deforestation",
    "wildlife": "wildlife",
    "indoor": "indoor",
    "chemical": "unknown",
    "air": "unknown",
    "hard": "hard",
}

SEVERITY_TAG = re.compile(r"-(HIGH|MEDIUM|LOW|NONE)(?:-|\.|$)", re.I)
BAIT_TAG = re.compile(
    r"^(flood|fire|sewage|waste|collapse|erosion|deforest(?:ation)?|wildlife|indoor|chemical|air)[-_]",
    re.I,
)


def _severity_from_name(name: str) -> str:
    match = SEVERITY_TAG.search(name)
    if not match:
        return ""
    return match.group(1).upper()


def _bait_from_name(name: str) -> str:
    match = BAIT_TAG.match(name)
    if not match:
        return ""
    raw = match.group(1).lower()
    if raw.startswith("deforest"):
        return "deforestation"
    return raw


def parse_entry(folder: str, path: Path) -> dict:
    """Return catalog row for one gold image."""
    name = path.name
    severity = _severity_from_name(name)
    bait = _bait_from_name(name)
    if folder == "hard":
        # hard/*-NONE-* are lookalikes that must NOT be that hazard
        true_kind = "none" if severity == "NONE" or "-NONE-" in name.upper() else (bait or "unknown")
        if severity != "NONE" and bait:
            true_kind = bait
        if severity == "NONE":
            true_kind = "none"
    else:
        true_kind = FOLDER_KIND.get(folder, folder)
    return {
        "path": str(path.relative_to(EVAL_DIR)).replace("\\", "/"),
        "abs_path": str(path),
        "folder": folder,
        "true_kind": true_kind,
        "severity_tag": severity,
        "bait_kind": bait,
        "filename": name,
    }


def list_photo_entries() -> list[dict]:
    if not PHOTOS_DIR.is_dir():
        return []
    rows = []
    for folder_path in sorted(PHOTOS_DIR.iterdir()):
        if not folder_path.is_dir():
            continue
        folder = folder_path.name.lower()
        for path in sorted(folder_path.iterdir()):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            if path.name.startswith("."):
                continue
            rows.append(parse_entry(folder, path))
    return rows


def write_labels_csv(rows: list[dict] | None = None) -> Path:
    rows = rows if rows is not None else list_photo_entries()
    LABELS_PATH.parent.mkdir(parents=True, exist_ok=True)
    with LABELS_PATH.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=["path", "folder", "true_kind", "severity_tag", "bait_kind", "filename"],
        )
        writer.writeheader()
        for row in rows:
            writer.writerow({key: row.get(key, "") for key in writer.fieldnames})
    return LABELS_PATH


def catalog_summary(rows: list[dict] | None = None) -> dict:
    rows = rows if rows is not None else list_photo_entries()
    by_kind: dict[str, int] = {}
    by_folder: dict[str, int] = {}
    for row in rows:
        by_kind[row["true_kind"]] = by_kind.get(row["true_kind"], 0) + 1
        by_folder[row["folder"]] = by_folder.get(row["folder"], 0) + 1
    return {
        "total": len(rows),
        "by_kind": dict(sorted(by_kind.items())),
        "by_folder": dict(sorted(by_folder.items())),
        "photos_dir": str(PHOTOS_DIR),
        "wired_into_detection": True,
    }
