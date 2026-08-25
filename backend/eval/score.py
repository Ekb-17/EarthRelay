"""Score EarthRelay photo-kind predictions on backend/eval/photos.

Folder name is the true class. bait_type is the wrong dropdown the reporter
picked — the same setup that filed a flood as wildfire.

  python backend/eval/score.py
  python backend/eval/score.py --index
  python backend/eval/score.py --gemini
"""

from __future__ import annotations

import argparse
import csv
import json
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
EVAL_DIR = Path(__file__).resolve().parent
PHOTOS_DIR = EVAL_DIR / "photos"
LABELS_PATH = EVAL_DIR / "labels.csv"
RESULTS_PATH = EVAL_DIR / "last_run.json"

sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from report import (  # noqa: E402
    analyze_scene,
    apply_gemini_scene,
    has_gemini_key,
    normalize_photo_kind,
    resolve_incident_type,
    score_photo,
    unwrap_gemini,
)

IMAGE_SUFFIXES = {".jpg", ".jpeg", ".png", ".webp"}
KINDS = (
    "flood",
    "fire",
    "collapse",
    "waste",
    "indoor",
    "sewage",
    "erosion",
    "deforestation",
    "wildlife",
)
FOLDERS = KINDS + ("hard",)
DEFAULT_LIMIT = 150
DEFAULT_BAIT = {
    "flood": "illegal_dumping",
    "fire": "illegal_dumping",
    "collapse": "illegal_dumping",
    "waste": "flood_damage",
    "indoor": "illegal_dumping",
    "sewage": "illegal_dumping",
    "erosion": "illegal_dumping",
    "deforestation": "illegal_dumping",
    "wildlife": "illegal_dumping",
}
KIND_TO_TYPE = {
    "flood": "flood_damage",
    "fire": "wildfire_smoke",
    "collapse": "earthquake",
    "waste": "illegal_dumping",
    "indoor": "other",
    "sewage": "sewage_discharge",
    "erosion": "erosion",
    "deforestation": "deforestation",
    "wildlife": "wildlife",
}
TYPE_TO_KIND = {
    "flood_damage": "flood",
    "river_overflow": "flood",
    "urban_flooding": "flood",
    "wildfire_smoke": "fire",
    "grass_fire": "fire",
    "burning_trash": "fire",
    "earthquake": "collapse",
    "illegal_dumping": "waste",
    "plastic_waste": "waste",
    "overflowing_garbage": "waste",
    "construction_debris": "waste",
    "e_waste": "waste",
    "tires_dumped": "waste",
    "other": "indoor",
    "oil_spill": "indoor",
    "chemical_spill": "indoor",
    "air_pollution": "indoor",
    "factory_smoke": "indoor",
    "sewage_discharge": "sewage",
    "water_pollution": "flood",
    "erosion": "erosion",
    "deforestation": "deforestation",
    "illegal_logging": "deforestation",
    "habitat_destruction": "deforestation",
    "wildlife": "wildlife",
    "injured_wildlife": "wildlife",
}


def _rel(path: Path) -> str:
    try:
        return path.relative_to(EVAL_DIR).as_posix()
    except ValueError:
        return path.as_posix()


def list_photos() -> list[Path]:
    found = []
    for folder in FOLDERS:
        folder_dir = PHOTOS_DIR / folder
        if not folder_dir.is_dir():
            continue
        for path in sorted(folder_dir.iterdir()):
            if path.is_file() and path.suffix.lower() in IMAGE_SUFFIXES:
                found.append(path)
    return found


def load_labels() -> dict[str, dict]:
    rows = {}
    if not LABELS_PATH.exists():
        return rows
    with LABELS_PATH.open(newline="", encoding="utf-8") as handle:
        for row in csv.DictReader(handle):
            key = (row.get("path") or "").strip().replace("\\", "/")
            if key:
                rows[key] = row
    return rows


def write_labels(rows: list[dict]) -> None:
    fieldnames = ["path", "truth_kind", "truth_type", "bait_type", "notes"]
    with LABELS_PATH.open("w", newline="", encoding="utf-8") as handle:
        writer = csv.DictWriter(handle, fieldnames=fieldnames)
        writer.writeheader()
        for row in rows:
            writer.writerow({name: row.get(name) or "" for name in fieldnames})


def hard_kind_from_name(path: Path) -> str:
    """fire-NONE-1.png → fire; other-NONE-1.png → indoor (Other dropdown)."""
    prefix = path.stem.split("-", 1)[0].strip().lower()
    if prefix in {"other", "unusual"}:
        return "indoor"
    return prefix if prefix in KINDS else ""


def row_for(path: Path, existing: dict[str, dict]) -> dict | None:
    rel = _rel(path)
    folder = path.parent.name
    saved = existing.get(rel) or {}
    truth = (saved.get("truth_kind") or "").strip().lower()
    if folder in KINDS:
        truth = folder
    elif folder == "hard" and truth not in KINDS:
        truth = hard_kind_from_name(path)
    if truth not in KINDS:
        return None
    return {
        "path": rel,
        "abs": path,
        "truth_kind": truth,
        "truth_type": (saved.get("truth_type") or "").strip() or KIND_TO_TYPE[truth],
        "bait_type": (saved.get("bait_type") or "").strip() or DEFAULT_BAIT[truth],
        "notes": (saved.get("notes") or "").strip(),
    }


def f1_score(tp: int, fp: int, fn: int) -> tuple[float, float, float]:
    precision = tp / (tp + fp) if tp + fp else 0.0
    recall = tp / (tp + fn) if tp + fn else 0.0
    if precision + recall == 0:
        return 0.0, 0.0, 0.0
    return precision, recall, 2 * precision * recall / (precision + recall)


def yolo_labels(image_path: Path) -> list[str]:
    from detect import detect_image

    with tempfile.TemporaryDirectory() as tmp:
        annotated = Path(tmp) / "ann.jpg"
        try:
            result = detect_image(image_path, annotated)
        except Exception:
            return []
    return result.get("labels") or []


def predict_kind(image_path: Path, bait_type: str, labels: list[str], use_gemini: bool) -> dict:
    scene = analyze_scene(image_path, labels)
    gemini = None
    flash_error = ""
    if use_gemini:
        raw = score_photo(
            image_path,
            {
                "incident_type": bait_type,
                "labels": labels,
                "weather": None,
                "ecosystem": {},
            },
            scene,
            labels,
        )
        gemini, flash_error = unwrap_gemini(raw)
        scene = apply_gemini_scene(scene, gemini)
    resolved, _match, note = resolve_incident_type(bait_type, scene, labels, gemini)
    kind = TYPE_TO_KIND.get(resolved) or normalize_photo_kind(
        (gemini or {}).get("photo_kind") or scene.get("kind"), resolved
    )
    if kind not in KINDS:
        kind = "unknown"
    return {
        "pred_kind": kind,
        "pred_type": resolved,
        "flash": "gemini" if gemini else "local",
        "flash_error": flash_error,
        "note": note,
    }


def print_table(headers: list[str], rows: list[list[str]]) -> None:
    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(cell))
    line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(line)
    print("  ".join("-" * w for w in widths))
    for row in rows:
        print("  ".join(row[i].ljust(widths[i]) for i in range(len(headers))))


def main() -> int:
    parser = argparse.ArgumentParser(description="Score EarthRelay photo-kind eval set.")
    parser.add_argument("--index", action="store_true", help="Write labels.csv from photos on disk.")
    parser.add_argument("--gemini", action="store_true", help="Call Gemini Flash (needs GEMINI_API_KEY).")
    parser.add_argument("--skip-yolo", action="store_true", help="Skip YOLO; scene + Flash only.")
    parser.add_argument(
        "--limit",
        type=int,
        default=DEFAULT_LIMIT,
        help=f"Max photos to score (default {DEFAULT_LIMIT}; 0 = no cap).",
    )
    args = parser.parse_args()

    photos = list_photos()
    existing = load_labels()
    catalog = []
    skipped_hard = []
    for path in photos:
        row = row_for(path, existing)
        if row:
            catalog.append(row)
        elif path.parent.name == "hard":
            skipped_hard.append(_rel(path))

    if args.index:
        write_labels(
            [
                {
                    "path": row["path"],
                    "truth_kind": row["truth_kind"],
                    "truth_type": row["truth_type"],
                    "bait_type": row["bait_type"],
                    "notes": row["notes"],
                }
                for row in catalog
            ]
        )
        print(f"Wrote {len(catalog)} rows to {LABELS_PATH}")
        if skipped_hard:
            print(f"Skipped {len(skipped_hard)} photos in hard/ with no truth_kind in labels.csv.")
        if not catalog:
            print("No photos yet. Drop JPGs into backend/eval/photos/<class>/ then run --index again.")
        return 0

    if not catalog:
        print("Eval folder is ready, but it has no photos yet.")
        print("Drop real pictures here (8-15 per class, max 150 total):")
        for name in FOLDERS:
            print(f"  {PHOTOS_DIR / name}")
        print("Then: python backend/eval/score.py --index")
        print("Then: python backend/eval/score.py          # local")
        print("  or: python backend/eval/score.py --gemini # Flash")
        if skipped_hard:
            print(f"Note: {len(skipped_hard)} files in hard/ need truth_kind in labels.csv.")
        return 0

    limit = args.limit if args.limit > 0 else None
    if limit and len(catalog) > limit:
        print(f"Scoring first {limit} of {len(catalog)} photos (cap {limit}; use --limit 0 to lift).")
        catalog = catalog[:limit]
    else:
        print(f"Scoring {len(catalog)} photos. Recommended max is {DEFAULT_LIMIT}.")

    use_gemini = bool(args.gemini)
    if use_gemini and not has_gemini_key():
        print("GEMINI_API_KEY is not loaded. Scoring on-device only.")
        use_gemini = False

    counts = {kind: {"tp": 0, "fp": 0, "fn": 0, "support": 0} for kind in KINDS}
    confusion = defaultdict(int)
    details = []

    for i, row in enumerate(catalog, start=1):
        labels = [] if args.skip_yolo else yolo_labels(row["abs"])
        pred = predict_kind(row["abs"], row["bait_type"], labels, use_gemini)
        truth = row["truth_kind"]
        guessed = pred["pred_kind"] if pred["pred_kind"] in KINDS else "unknown"
        confusion[(truth, guessed)] += 1
        counts[truth]["support"] += 1
        if guessed == truth:
            counts[truth]["tp"] += 1
        else:
            counts[truth]["fn"] += 1
            if guessed in counts:
                counts[guessed]["fp"] += 1
        ok = "ok" if guessed == truth else "MISS"
        print(f"[{i}/{len(catalog)}] {ok:4}  {truth:9} -> {guessed:9}  {row['path']}")
        details.append(
            {
                "path": row["path"],
                "truth_kind": truth,
                "pred_kind": guessed,
                "bait_type": row["bait_type"],
                "pred_type": pred["pred_type"],
                "flash": pred["flash"],
                "ok": guessed == truth,
            }
        )

    print()
    metric_rows = []
    f1s = []
    for kind in KINDS:
        n = counts[kind]["support"]
        if n == 0:
            continue
        p, r, f1 = f1_score(counts[kind]["tp"], counts[kind]["fp"], counts[kind]["fn"])
        f1s.append(f1)
        metric_rows.append(
            [kind, str(n), f"{p:.2f}", f"{r:.2f}", f"{f1:.2f}"]
        )
    if metric_rows:
        print_table(["kind", "n", "precision", "recall", "f1"], metric_rows)
        print(f"\nMacro F1  {sum(f1s) / len(f1s):.2f}   ({'gemini' if use_gemini else 'local'})")

    used = []
    for kind in KINDS:
        if counts[kind]["support"]:
            used.append(kind)
    extra = sorted({pred for (_t, pred) in confusion if pred not in used})
    cols = used + extra
    if cols:
        print("\nConfusion (rows = truth, columns = predicted)")
        print_table(
            ["truth", *cols],
            [
                [truth, *[str(confusion.get((truth, col), 0)) for col in cols]]
                for truth in used
            ],
        )

    RESULTS_PATH.write_text(json.dumps({"gemini": use_gemini, "rows": details}, indent=2), encoding="utf-8")
    print(f"\nWrote {RESULTS_PATH}")
    if skipped_hard:
        print(f"Skipped {len(skipped_hard)} hard/ photos with no truth_kind.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
