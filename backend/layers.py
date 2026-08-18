"""Weather, air quality, wildlife, protected areas, and satellite layers."""

from __future__ import annotations

import asyncio
import re
from datetime import datetime, timedelta, timezone

from hazards import extract_point
from net import (
    NETWORK_ERRORS,
    collection_from_features,
    empty_collection,
    fetch_json_sync,
    read_geojson,
    write_geojson,
)

GBIF_OCCURRENCE = "https://api.gbif.org/v1/occurrence/search"
OPEN_METEO_WEATHER = "https://api.open-meteo.com/v1/forecast"
OPEN_METEO_AIR = "https://air-quality-api.open-meteo.com/v1/air-quality"
NATURAL_EARTH_PARKS = (
    "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/"
    "geojson/ne_10m_parks_and_protected_lands_point.geojson"
)
UNESCO_HERITAGE = (
    "https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/"
    "world-heritage-unesco-list/exports/geojson?lang=en&timezone=UTC"
)

WEATHER_CODES = {
    0: "Clear",
    1: "Mostly clear",
    2: "Partly cloudy",
    3: "Overcast",
    45: "Fog",
    48: "Icy fog",
    51: "Light drizzle",
    61: "Rain",
    71: "Snow",
    80: "Rain showers",
    95: "Thunderstorm",
}


def satellite_config() -> dict:
    date = (datetime.now(timezone.utc) - timedelta(days=1)).strftime("%Y-%m-%d")
    return {
        "source": "NASA GIBS VIIRS",
        "date": date,
        "tiles": [
            (
                "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/"
                "VIIRS_SNPP_CorrectedReflectance_TrueColor/default/"
                f"{date}/GoogleMapsCompatible_Level9/{{z}}/{{y}}/{{x}}.jpg"
            )
        ],
        "tileSize": 256,
        "maxzoom": 9,
        "attribution": "NASA GIBS",
        "note": "Tiled satellite imagery. No local GPU required.",
    }


def _point_feature(event_id: str, title: str, lat: float, lng: float, **props) -> dict:
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": {"id": event_id, "title": title, **props},
    }


def strip_html(text: str | None) -> str | None:
    if not text:
        return text
    return re.sub(r"<[^>]+>", " ", str(text)).strip()


async def fetch_json(url: str, params: dict | None = None) -> dict:
    return await asyncio.to_thread(fetch_json_sync, url, params)


async def download_wildlife(limit: int = 250) -> dict:
    features = []
    seen = set()
    for category in ("CR", "EN", "VU"):
        payload = await fetch_json(
            GBIF_OCCURRENCE,
            {
                "hasCoordinate": "true",
                "hasGeospatialIssue": "false",
                "occurrenceStatus": "PRESENT",
                "iucnRedListCategory": category,
                "limit": str(limit // 3),
            },
        )
        for record in payload.get("results") or []:
            lat = record.get("decimalLatitude")
            lng = record.get("decimalLongitude")
            key = record.get("key")
            if lat is None or lng is None or key in seen:
                continue
            seen.add(key)
            name = record.get("species") or record.get("scientificName") or "Wildlife record"
            features.append(
                _point_feature(
                    f"gbif-{key}",
                    name,
                    float(lat),
                    float(lng),
                    hazard="wildlife",
                    source="GBIF",
                    severity=category,
                    species=name,
                    vernacular=record.get("vernacularName"),
                    country=record.get("country"),
                    time=record.get("eventDate"),
                    url=f"https://www.gbif.org/occurrence/{key}",
                    description=f"{category} IUCN record from GBIF",
                )
            )
    collection = collection_from_features(features)
    write_geojson("wildlife.geojson", collection)
    return collection


def _protected_from_natural_earth(payload: dict) -> list[dict]:
    features = []
    for index, item in enumerate(payload.get("features") or []):
        geometry = item.get("geometry") or {}
        if geometry.get("type") != "Point":
            continue
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue
        props = item.get("properties") or {}
        name = props.get("name") or props.get("unit_name") or f"Protected area {index}"
        features.append(
            _point_feature(
                f"ne-park-{index}-{name}",
                name,
                float(coords[1]),
                float(coords[0]),
                hazard="protected",
                source="Natural Earth",
                severity="protected",
                description=props.get("type") or "Park or protected land",
                extra_type=props.get("type"),
            )
        )
    return features


def _protected_from_unesco(payload: dict) -> list[dict]:
    features = []
    for index, item in enumerate((payload.get("features") or [])[:400]):
        geometry = item.get("geometry") or {}
        lat, lng = extract_point(geometry)
        if lat is None or lng is None:
            continue
        props = item.get("properties") or {}
        name = (
            props.get("name_en")
            or props.get("name")
            or props.get("site")
            or props.get("name_en")
            or "World Heritage site"
        )
        features.append(
            _point_feature(
                f"unesco-{index}-{name}",
                name,
                lat,
                lng,
                hazard="protected",
                source="UNESCO",
                severity="heritage",
                description=strip_html(
                    props.get("short_description_en")
                    or props.get("category")
                    or props.get("category_short")
                ),
                url=props.get("http_url"),
                country=props.get("states_name_en") or props.get("country"),
            )
        )
    return features


async def download_protected_areas() -> dict:
    features = []
    errors = []
    try:
        parks = await fetch_json(NATURAL_EARTH_PARKS)
        features.extend(_protected_from_natural_earth(parks))
    except NETWORK_ERRORS as exc:
        errors.append(str(exc))
    try:
        heritage = await asyncio.to_thread(fetch_json_sync, UNESCO_HERITAGE, None, 90)
        features.extend(_protected_from_unesco(heritage))
    except NETWORK_ERRORS as exc:
        errors.append(str(exc))
    collection = collection_from_features(features)
    collection["errors"] = errors
    write_geojson("protected_areas.geojson", collection)
    return collection


async def load_wildlife() -> dict:
    cached = read_geojson("wildlife.geojson")
    if cached and cached.get("features"):
        return cached
    try:
        return await download_wildlife()
    except NETWORK_ERRORS:
        return empty_collection()


async def load_protected_areas() -> dict:
    cached = read_geojson("protected_areas.geojson")
    if cached and cached.get("features"):
        return cached
    try:
        return await download_protected_areas()
    except NETWORK_ERRORS:
        return empty_collection()


async def load_weather(lat: float, lng: float) -> dict:
    payload = await fetch_json(
        OPEN_METEO_WEATHER,
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lng:.4f}",
            "current": "temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,wind_direction_10m",
            "daily": "precipitation_sum,precipitation_probability_max,temperature_2m_max",
            "forecast_days": "2",
            "timezone": "auto",
        },
    )
    current = payload.get("current") or {}
    code = current.get("weather_code")
    daily = payload.get("daily") or {}
    rain_values = daily.get("precipitation_sum") or [None]
    rain_chance = daily.get("precipitation_probability_max") or [None]
    return {
        "source": "Open-Meteo",
        "lat": lat,
        "lng": lng,
        "temperature_c": current.get("temperature_2m"),
        "feels_like_c": current.get("apparent_temperature"),
        "humidity": current.get("relative_humidity_2m"),
        "precipitation_mm": current.get("precipitation"),
        "wind_kmh": current.get("wind_speed_10m"),
        "wind_dir": current.get("wind_direction_10m"),
        "condition": WEATHER_CODES.get(code, f"Weather code {code}"),
        "time": current.get("time"),
        "rain_next_24h_mm": rain_values[0] if rain_values else None,
        "rain_chance_pct": rain_chance[0] if rain_chance else None,
        "temp_max_c": (daily.get("temperature_2m_max") or [None])[0],
        "river_level": None,
        "river_note": "No public river-gauge was linked for this pin. Rain forecast is used as wash-downstream risk.",
    }


async def load_air_quality(lat: float, lng: float) -> dict:
    payload = await fetch_json(
        OPEN_METEO_AIR,
        {
            "latitude": f"{lat:.4f}",
            "longitude": f"{lng:.4f}",
            "current": "pm10,pm2_5,carbon_monoxide,nitrogen_dioxide,ozone,us_aqi,european_aqi",
            "timezone": "auto",
        },
    )
    current = payload.get("current") or {}
    us_aqi = current.get("us_aqi")
    if us_aqi is None:
        band = "unknown"
    elif us_aqi <= 50:
        band = "good"
    elif us_aqi <= 100:
        band = "moderate"
    elif us_aqi <= 150:
        band = "unhealthy_sensitive"
    else:
        band = "unhealthy"
    return {
        "source": "Open-Meteo Air Quality",
        "lat": lat,
        "lng": lng,
        "us_aqi": us_aqi,
        "european_aqi": current.get("european_aqi"),
        "band": band,
        "pm25": current.get("pm2_5"),
        "pm10": current.get("pm10"),
        "ozone": current.get("ozone"),
        "no2": current.get("nitrogen_dioxide"),
        "co": current.get("carbon_monoxide"),
        "time": current.get("time"),
    }


async def load_environment() -> dict:
    wildlife, protected = await asyncio.gather(load_wildlife(), load_protected_areas())
    return {
        "wildlife": wildlife,
        "protected": protected,
        "satellite": satellite_config(),
        "counts": {
            "wildlife": len(wildlife.get("features") or []),
            "protected": len(protected.get("features") or []),
        },
        "sources": {
            "weather": ["Open-Meteo"],
            "air": ["Open-Meteo"],
            "wildlife": ["GBIF IUCN CR/EN/VU"],
            "protected": ["Natural Earth parks", "UNESCO World Heritage"],
            "satellite": ["NASA GIBS"],
            "mapbox": ["mapbox-gl (npm)"],
        },
    }
