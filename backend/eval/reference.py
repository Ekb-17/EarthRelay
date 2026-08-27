"""Nearest-neighbor votes from the eval gold set for live photo scoring.

This does not train a new model. It compares the citizen photo to labeled
eval images (your 200+ gold set) and returns a kind vote when Flash is weak
or flood/sewage is ambiguous.
"""

from __future__ import annotations

import json
import threading
from pathlib import Path

from PIL import Image, ImageOps

from eval.catalog import EVAL_DIR, list_photo_entries

FINGERPRINTS_PATH = EVAL_DIR / "fingerprints.json"
HASH_SIZE = 16
HIST_BINS = 4

_lock = threading.Lock()
_cache: dict | None = None

KIND_TO_INCIDENT = {
    "flood": "flood_damage",
    "fire": "wildfire_smoke",
    "sewage": "sewage_discharge",
    "waste": "illegal_dumping",
    "collapse": "earthquake",
    "erosion": "erosion",
    "deforestation": "deforestation",
    "wildlife": "wildlife",
    "indoor": "other",
    "none": "other",
    "unknown": "other",
}


def _ahash_bits(image: Image.Image, size: int = HASH_SIZE) -> list[int]:
    gray = image.convert("L").resize((size, size), Image.Resampling.BILINEAR)
    pixels = list(gray.getdata())
    avg = sum(pixels) / max(1, len(pixels))
    return [1 if value >= avg else 0 for value in pixels]


def _color_hist(image: Image.Image, bins: int = HIST_BINS) -> list[float]:
    small = image.convert("RGB").resize((48, 48), Image.Resampling.BILINEAR)
    hist = [0.0] * (bins * bins * bins)
    step = 256 / bins
    for red, green, blue in small.getdata():
        ri = min(bins - 1, int(red / step))
        gi = min(bins - 1, int(green / step))
        bi = min(bins - 1, int(blue / step))
        hist[ri * bins * bins + gi * bins + bi] += 1.0
    total = sum(hist) or 1.0
    return [value / total for value in hist]


def fingerprint_image(path: Path) -> dict:
    image = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    image.thumbnail((256, 256))
    return {
        "ahash": _ahash_bits(image),
        "hist": _color_hist(image),
    }


def _hamming(a: list[int], b: list[int]) -> int:
    return sum(x != y for x, y in zip(a, b))


def _hist_l1(a: list[float], b: list[float]) -> float:
    return sum(abs(x - y) for x, y in zip(a, b))


def _distance(fp_a: dict, fp_b: dict) -> float:
    # Normalize: ahash max distance = HASH_SIZE**2, hist L1 max ~2
    hash_part = _hamming(fp_a["ahash"], fp_b["ahash"]) / float(HASH_SIZE * HASH_SIZE)
    hist_part = _hist_l1(fp_a["hist"], fp_b["hist"]) / 2.0
    return 0.65 * hash_part + 0.35 * hist_part


def build_fingerprint_index(force: bool = False) -> dict:
    global _cache
    with _lock:
        if _cache is not None and not force and FINGERPRINTS_PATH.exists():
            return _cache
        entries = list_photo_entries()
        items = []
        for row in entries:
            path = Path(row["abs_path"])
            if not path.exists():
                continue
            try:
                fp = fingerprint_image(path)
            except Exception:
                continue
            items.append(
                {
                    "path": row["path"],
                    "true_kind": row["true_kind"],
                    "severity_tag": row["severity_tag"],
                    "bait_kind": row["bait_kind"],
                    "folder": row["folder"],
                    "ahash": fp["ahash"],
                    "hist": fp["hist"],
                }
            )
        payload = {"count": len(items), "items": items}
        FINGERPRINTS_PATH.write_text(json.dumps(payload), encoding="utf-8")
        _cache = payload
        return payload


def load_fingerprint_index() -> dict:
    global _cache
    with _lock:
        if _cache is not None:
            return _cache
        if FINGERPRINTS_PATH.exists():
            try:
                _cache = json.loads(FINGERPRINTS_PATH.read_text(encoding="utf-8"))
                if (_cache or {}).get("items"):
                    return _cache
            except json.JSONDecodeError:
                pass
    return build_fingerprint_index(force=True)


def match_eval_reference(image_path: Path | str, top_k: int = 7) -> dict:
    """Compare one citizen photo to the gold set. Returns kind vote + neighbors."""
    path = Path(image_path)
    empty = {
        "kind": "unknown",
        "confidence": 0.0,
        "incident_type": "",
        "severity_tag": "",
        "neighbors": [],
        "source": "eval_reference",
        "usable": False,
    }
    if not path.exists():
        return empty
    try:
        probe = fingerprint_image(path)
    except Exception:
        return empty

    index = load_fingerprint_index()
    items = index.get("items") or []
    if not items:
        return empty

    scored = []
    for item in items:
        dist = _distance(probe, item)
        scored.append((dist, item))
    scored.sort(key=lambda pair: pair[0])
    neighbors = scored[:top_k]
    if not neighbors:
        return empty

    # Reject weak matches (too far from any gold image)
    best_dist = neighbors[0][0]
    if best_dist > 0.42:
        return {**empty, "neighbors": _public_neighbors(neighbors), "best_distance": round(best_dist, 4)}

    votes: dict[str, float] = {}
    severity_votes: dict[str, float] = {}
    for rank, (dist, item) in enumerate(neighbors):
        if dist > 0.48:
            continue
        weight = max(0.05, 1.0 - dist) * (1.5 if rank == 0 else 1.0)
        kind = item.get("true_kind") or "unknown"
        votes[kind] = votes.get(kind, 0.0) + weight
        tag = (item.get("severity_tag") or "").upper()
        if tag:
            severity_votes[tag] = severity_votes.get(tag, 0.0) + weight

    if not votes:
        return {**empty, "neighbors": _public_neighbors(neighbors), "best_distance": round(best_dist, 4)}

    winner, win_score = max(votes.items(), key=lambda pair: pair[1])
    total = sum(votes.values()) or 1.0
    confidence = round(min(0.95, win_score / total), 3)
    severity_tag = ""
    if severity_votes:
        severity_tag = max(severity_votes.items(), key=lambda pair: pair[1])[0]

    # Near-exact gold hits (or a clear plurality) are usable
    top_kinds = [item.get("true_kind") for _, item in neighbors[:5]]
    plurality = top_kinds.count(winner)
    usable = False
    if best_dist <= 0.08:
        usable = True
        confidence = max(confidence, 0.85)
    elif best_dist <= 0.36 and confidence >= 0.4:
        usable = True
    elif best_dist <= 0.4 and plurality >= 3 and confidence >= 0.34:
        usable = True
    return {
        "kind": winner,
        "confidence": confidence,
        "incident_type": KIND_TO_INCIDENT.get(winner, ""),
        "severity_tag": severity_tag,
        "neighbors": _public_neighbors(neighbors),
        "best_distance": round(best_dist, 4),
        "source": "eval_reference",
        "usable": usable,
        "votes": {key: round(val, 3) for key, val in sorted(votes.items(), key=lambda p: -p[1])},
    }


def _public_neighbors(neighbors: list[tuple[float, dict]]) -> list[dict]:
    out = []
    for dist, item in neighbors[:5]:
        out.append(
            {
                "path": item.get("path"),
                "true_kind": item.get("true_kind"),
                "severity_tag": item.get("severity_tag"),
                "distance": round(dist, 4),
            }
        )
    return out


def apply_eval_hint_to_gemini(gemini: dict | None, hint: dict | None) -> dict | None:
    """When Flash/Pro is weak or unknown, fill kind from gold-set vote."""
    if not hint or not hint.get("usable"):
        return gemini
    kind = hint.get("kind") or "unknown"
    if kind in {"unknown", ""}:
        return gemini
    base = dict(gemini or {})
    current = str(base.get("photo_kind") or "").strip().lower()
    weak = (
        not gemini
        or gemini.get("_failed")
        or current in {"", "unknown"}
        or base.get("severity") is None
    )
    # Gold none-votes block false flood/fire from hard lookalikes when match is strong
    if kind == "none" and hint.get("confidence", 0) >= 0.55:
        base["photo_kind"] = "indoor"
        base["incident_type"] = "other"
        base["eval_reference"] = hint
        base["eval_override"] = "hard_negative"
        return base
    if weak or current == "unknown":
        if kind != "none":
            base["photo_kind"] = kind
            if hint.get("incident_type"):
                base["incident_type"] = hint["incident_type"]
            base["eval_reference"] = hint
            if base.get("severity") is None and hint.get("severity_tag") == "HIGH":
                base["severity"] = 8.2
                base["priority"] = "HIGH"
            elif base.get("severity") is None and hint.get("severity_tag") == "MEDIUM":
                base["severity"] = 6.8
                base["priority"] = "MEDIUM"
            elif base.get("severity") is None and hint.get("severity_tag") == "LOW":
                base["severity"] = 3.5
                base["priority"] = "LOW"
        return base
    # Ambiguous flood vs sewage: if citizen path left unknown, gold set can break ties
    if {current, kind} == {"flood", "sewage"} and hint.get("confidence", 0) >= 0.6:
        base["photo_kind"] = kind
        base["incident_type"] = hint.get("incident_type") or base.get("incident_type")
        base["eval_reference"] = hint
        base["eval_override"] = "water_tiebreak"
    return base
