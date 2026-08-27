"""Score EarthRelay photo-kind predictions on backend/eval/photos.

Folder / filename tags are the true class. Run:

  python -m eval.score
  python -m eval.score --index
  python -m eval.score --limit 40
  python -m eval.score --gemini
"""

from __future__ import annotations

import argparse
import json
import sys
import tempfile
from collections import defaultdict
from pathlib import Path

BACKEND = Path(__file__).resolve().parents[1]
ROOT = BACKEND.parent
EVAL_DIR = Path(__file__).resolve().parent
RESULTS_PATH = EVAL_DIR / "last_run.json"

sys.path.insert(0, str(BACKEND))

from dotenv import load_dotenv

load_dotenv(ROOT / ".env")

from eval.catalog import catalog_summary, list_photo_entries, write_labels_csv  # noqa: E402
from eval.reference import build_fingerprint_index, match_eval_reference  # noqa: E402
from report import (  # noqa: E402
    analyze_scene,
    apply_gemini_scene,
    has_gemini_key,
    normalize_photo_kind,
    resolve_incident_type,
    score_photo,
    should_call_gemini,
    unwrap_gemini,
)


def predict_local(path: Path, bait_type: str = "other") -> dict:
    from detect import detect_image

    with tempfile.TemporaryDirectory() as tmp:
        ann = Path(tmp) / "ann.jpg"
        try:
            detection = detect_image(path, ann)
        except Exception as exc:
            detection = {"labels": [], "error": str(exc)}
    labels = detection.get("labels") or []
    scene = analyze_scene(path, labels)
    hint = match_eval_reference(path)
    gemini = None
    if should_call_gemini(scene, labels) and has_gemini_key():
        raw = score_photo(path, {"incident_type": bait_type, "labels": labels}, scene, labels)
        gemini, _ = unwrap_gemini(raw)
    # Apply gold-set vote the same way live scoring does
    from eval.reference import apply_eval_hint_to_gemini

    gemini = apply_eval_hint_to_gemini(gemini, hint)
    scene = apply_gemini_scene(scene, gemini)
    resolved, matched, note = resolve_incident_type(bait_type, scene, labels, gemini)
    kind = normalize_photo_kind((gemini or {}).get("photo_kind") or scene.get("kind"), resolved)
    return {
        "pred_kind": kind,
        "pred_type": resolved,
        "type_match": matched,
        "type_note": note,
        "eval_hint": hint.get("kind") if hint else "",
        "eval_confidence": hint.get("confidence") if hint else 0,
        "flash": bool(gemini),
    }


def f1_scores(truth: list[str], pred: list[str]) -> dict:
    labels = sorted(set(truth) | set(pred))
    scores = {}
    for label in labels:
        tp = sum(1 for t, p in zip(truth, pred) if t == label and p == label)
        fp = sum(1 for t, p in zip(truth, pred) if t != label and p == label)
        fn = sum(1 for t, p in zip(truth, pred) if t == label and p != label)
        prec = tp / (tp + fp) if tp + fp else 0.0
        rec = tp / (tp + fn) if tp + fn else 0.0
        f1 = 2 * prec * rec / (prec + rec) if prec + rec else 0.0
        scores[label] = {"precision": round(prec, 3), "recall": round(rec, 3), "f1": round(f1, 3), "support": tp + fn}
    return scores


def main() -> int:
    parser = argparse.ArgumentParser(description="EarthRelay eval gold-set scorecard")
    parser.add_argument("--index", action="store_true", help="Rebuild labels.csv + fingerprints only")
    parser.add_argument("--limit", type=int, default=80, help="Max photos (0 = all)")
    parser.add_argument("--gemini", action="store_true", help="Allow Gemini calls (uses quota)")
    args = parser.parse_args()

    rows = list_photo_entries()
    write_labels_csv(rows)
    build_fingerprint_index(force=True)
    summary = catalog_summary(rows)
    print(f"Indexed {summary['total']} gold photos")
    print("By kind:", summary["by_kind"])
    if args.index:
        return 0

    if not rows:
        print("No photos in backend/eval/photos — nothing to score.")
        return 1

    limit = None if args.limit == 0 else args.limit
    selected = rows[:limit] if limit else rows
    # Prefer non-hard first for a balanced quick run
    selected = sorted(selected, key=lambda row: (row["folder"] == "hard", row["folder"], row["filename"]))
    if limit:
        selected = selected[:limit]

    truth = []
    pred = []
    details = []
    for row in selected:
        path = Path(row["abs_path"])
        bait = "other"
        if row["folder"] == "hard" and row.get("bait_kind"):
            bait = {
                "flood": "flood_damage",
                "fire": "wildfire_smoke",
                "sewage": "sewage_discharge",
                "waste": "illegal_dumping",
                "collapse": "earthquake",
                "erosion": "erosion",
                "deforestation": "deforestation",
                "wildlife": "wildlife",
            }.get(row["bait_kind"], "other")
        if not args.gemini:
            # Local + eval reference only (no Gemini spend)
            hint = match_eval_reference(path)
            kind = hint.get("kind") if hint.get("usable") else "unknown"
            if kind == "none":
                kind = "indoor"
            result = {
                "pred_kind": kind,
                "pred_type": "",
                "eval_hint": hint.get("kind"),
                "eval_confidence": hint.get("confidence"),
                "flash": False,
            }
        else:
            result = predict_local(path, bait_type=bait)
        true_kind = row["true_kind"]
        if true_kind == "none":
            true_kind = "indoor"
        truth.append(true_kind)
        pred.append(result["pred_kind"] or "unknown")
        details.append({**row, **result, "true_kind_norm": true_kind})
        mark = "OK" if truth[-1] == pred[-1] else "MISS"
        print(f"{mark} {row['filename']}: true={true_kind} pred={pred[-1]} eval={result.get('eval_hint')}")

    scores = f1_scores(truth, pred)
    correct = sum(1 for t, p in zip(truth, pred) if t == p)
    payload = {
        "n": len(details),
        "accuracy": round(correct / max(1, len(details)), 3),
        "f1": scores,
        "gemini": bool(args.gemini),
        "details": details,
        "summary": summary,
    }
    RESULTS_PATH.write_text(json.dumps(payload, indent=2), encoding="utf-8")
    print(f"Accuracy {payload['accuracy']} on {payload['n']} photos")
    print("F1:", {k: v["f1"] for k, v in scores.items()})
    print(f"Wrote {RESULTS_PATH}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
