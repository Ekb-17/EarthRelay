"""Shared HTTP helpers and local GeoJSON cache for EarthRelay."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode
from urllib.request import Request, urlopen

DATA_DIR = Path(__file__).resolve().parent / "data"
HEADERS = {
    "User-Agent": "EarthRelay/1.0 (environmental case intelligence)",
    "Accept": "application/json, application/geo+json, */*",
}


def fetch_json_sync(url: str, params: dict | None = None, timeout: int = 45) -> Any:
    full_url = f"{url}?{urlencode(params)}" if params else url
    request = Request(full_url, headers=HEADERS)
    with urlopen(request, timeout=timeout) as response:
        return json.loads(response.read().decode("utf-8"))


def fetch_bytes_sync(url: str, timeout: int = 60) -> bytes:
    request = Request(url, headers=HEADERS)
    with urlopen(request, timeout=timeout) as response:
        return response.read()


def write_geojson(name: str, payload: dict) -> Path:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / name
    path.write_text(json.dumps(payload), encoding="utf-8")
    return path


def read_geojson(name: str) -> dict | None:
    path = DATA_DIR / name
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if isinstance(payload, dict) and payload.get("type") == "FeatureCollection":
        return payload
    return None


def empty_collection() -> dict:
    return {"type": "FeatureCollection", "features": []}


def collection_from_features(features: list[dict]) -> dict:
    return {"type": "FeatureCollection", "features": features}


NETWORK_ERRORS = (HTTPError, URLError, TimeoutError, OSError, json.JSONDecodeError)
