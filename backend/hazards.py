"""Live earthquake, tsunami, and flood feeds for EarthRelay."""

from __future__ import annotations

import asyncio
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Any

from net import (
    NETWORK_ERRORS,
    collection_from_features,
    fetch_json_sync,
    read_geojson,
    write_geojson,
)

USGS_QUERY = "https://earthquake.usgs.gov/fdsnws/event/1/query"
USGS_WEEK_45 = (
    "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/4.5_week.geojson"
)
EONET_FLOODS = "https://eonet.gsfc.nasa.gov/api/v3/events/geojson"
GDACS_SEARCH = "https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH"
NOAA_TSUNAMI = "https://www.ngdc.noaa.gov/hazel/hazard-service/api/v1/tsunamis/events"

CACHE_TTL_SECONDS = 180
_cache: dict[str, tuple[float, Any]] = {}


def strip_html(text: str | None) -> str | None:
    if not text:
        return text
    return re.sub(r"<[^>]+>", " ", str(text)).strip()


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def iso(dt: datetime | None) -> str | None:
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat()


def extract_point(geometry: dict | None) -> tuple[float | None, float | None]:
    if not geometry:
        return None, None
    gtype = geometry.get("type")
    coords = geometry.get("coordinates")
    if gtype == "Point" and coords and len(coords) >= 2:
        return float(coords[1]), float(coords[0])
    if gtype == "MultiPoint" and coords:
        c = coords[0]
        return float(c[1]), float(c[0])
    if gtype == "LineString" and coords:
        c = coords[len(coords) // 2]
        return float(c[1]), float(c[0])
    if gtype == "Polygon" and coords:
        c = coords[0][0]
        return float(c[1]), float(c[0])
    if gtype == "MultiPolygon" and coords:
        c = coords[0][0][0]
        return float(c[1]), float(c[0])
    if gtype == "GeometryCollection":
        for geom in geometry.get("geometries") or []:
            lat, lng = extract_point(geom)
            if lat is not None:
                return lat, lng
    return None, None


def quake_severity(magnitude: float | None, alert: str | None) -> str:
    if alert in {"red"}:
        return "severe"
    if alert in {"orange"} or (magnitude is not None and magnitude >= 7):
        return "high"
    if alert in {"yellow"} or (magnitude is not None and magnitude >= 5.5):
        return "moderate"
    return "low"


def gdacs_severity(alert_level: str | None) -> str:
    level = (alert_level or "").strip().lower()
    if level == "red":
        return "severe"
    if level == "orange":
        return "high"
    if level == "green":
        return "moderate"
    return "low"


def as_feature(
    *,
    event_id: str,
    hazard: str,
    title: str,
    lat: float,
    lng: float,
    severity: str,
    source: str,
    time_iso: str | None = None,
    magnitude: float | None = None,
    depth_km: float | None = None,
    url: str | None = None,
    description: str | None = None,
    extra: dict | None = None,
) -> dict:
    properties = {
        "id": event_id,
        "hazard": hazard,
        "title": title,
        "severity": severity,
        "source": source,
        "time": time_iso,
        "magnitude": magnitude,
        "depth_km": depth_km,
        "url": url,
        "description": description or title,
        **(extra or {}),
    }
    return {
        "type": "Feature",
        "geometry": {"type": "Point", "coordinates": [lng, lat]},
        "properties": properties,
    }


def collection(features: list[dict]) -> dict:
    return collection_from_features(features)


async def cached(key: str, fetcher) -> Any:
    now = time.time()
    hit = _cache.get(key)
    if hit and now - hit[0] < CACHE_TTL_SECONDS:
        return hit[1]
    data = await fetcher()
    _cache[key] = (now, data)
    return data


async def fetch_json(url: str, params: dict | None = None) -> Any:
    return await asyncio.to_thread(fetch_json_sync, url, params)


def parse_usgs_features(payload: dict, *, tsunami_only: bool = False) -> list[dict]:
    features = []
    for item in payload.get("features") or []:
        props = item.get("properties") or {}
        geometry = item.get("geometry") or {}
        coords = geometry.get("coordinates") or []
        if len(coords) < 2:
            continue
        tsunami_flag = int(props.get("tsunami") or 0) == 1
        if tsunami_only and not tsunami_flag:
            continue
        lng, lat = float(coords[0]), float(coords[1])
        depth = float(coords[2]) if len(coords) > 2 and coords[2] is not None else None
        mag = props.get("mag")
        magnitude = float(mag) if mag is not None else None
        event_time = props.get("time")
        time_iso = (
            datetime.fromtimestamp(event_time / 1000, tz=timezone.utc).isoformat()
            if event_time
            else None
        )
        place = props.get("place") or "Unknown location"
        hazard = "tsunami" if tsunami_only else "earthquake"
        title = f"M{magnitude:.1f} — {place}" if magnitude is not None else place
        description = place
        if tsunami_only:
            title = f"Tsunami watch region — {place}"
            description = (
                "USGS flagged this earthquake for tsunami-warning-center notification. "
                "This is a regional hazard indicator, not confirmation that a tsunami occurred."
            )
        features.append(
            as_feature(
                event_id=str(item.get("id") or place),
                hazard=hazard,
                title=title,
                lat=lat,
                lng=lng,
                severity=quake_severity(magnitude, props.get("alert")),
                source="USGS",
                time_iso=time_iso,
                magnitude=magnitude,
                depth_km=depth,
                url=props.get("url"),
                description=description,
                extra={
                    "tsunami_flag": tsunami_flag,
                    "alert": props.get("alert"),
                    "status": props.get("status"),
                    "place": place,
                },
            )
        )
    return features


def parse_eonet_floods(payload: dict) -> list[dict]:
    features = []
    for item in payload.get("features") or []:
        props = item.get("properties") or {}
        lat, lng = extract_point(item.get("geometry"))
        if lat is None or lng is None:
            continue
        title = props.get("title") or "Flood event"
        closed = props.get("closed")
        event_time = props.get("date") or (props.get("geometryDates") or [None])[0]
        features.append(
            as_feature(
                event_id=str(props.get("id") or title),
                hazard="flood",
                title=title,
                lat=lat,
                lng=lng,
                severity="high" if not closed else "moderate",
                source="NASA EONET",
                time_iso=event_time,
                url=props.get("link"),
                description=props.get("description") or title,
                extra={"status": "closed" if closed else "open"},
            )
        )
    return features


def _gdacs_props(item: dict) -> dict:
    props = item.get("properties") or {}
    nested = props.get("properties")
    if isinstance(nested, dict):
        return {**nested, **{k: v for k, v in props.items() if k != "properties"}}
    return props


def parse_gdacs(payload: dict, hazard: str) -> list[dict]:
    features = []
    items = payload.get("features") if isinstance(payload, dict) else None
    if items is None and isinstance(payload, list):
        items = payload
    for item in items or []:
        if not isinstance(item, dict):
            continue
        props = _gdacs_props(item)
        lat, lng = extract_point(item.get("geometry"))
        if lat is None or lng is None:
            lat = props.get("lat") or props.get("latitude")
            lng = props.get("lon") or props.get("lng") or props.get("longitude")
            if lat is None or lng is None:
                continue
            lat, lng = float(lat), float(lng)
        name = props.get("name") or props.get("eventname") or f"{hazard.title()} event"
        country = props.get("country") or ""
        title = f"{name} — {country}".strip(" —") if country else name
        alert = props.get("alertlevel") or props.get("alertLevel")
        event_id = str(props.get("eventid") or props.get("eventId") or name)
        url = (
            props.get("url")
            or f"https://www.gdacs.org/report.aspx?eventid={event_id}&eventtype={props.get('eventtype', '')}"
        )
        features.append(
            as_feature(
                event_id=f"gdacs-{hazard}-{event_id}",
                hazard=hazard,
                title=title,
                lat=lat,
                lng=lng,
                severity=gdacs_severity(str(alert) if alert is not None else None),
                source="GDACS",
                time_iso=props.get("todate") or props.get("fromdate") or props.get("toDate"),
                url=url,
                description=strip_html(props.get("htmldescription")) or title,
                extra={
                    "alert": alert,
                    "country": country,
                    "glide": props.get("glide"),
                },
            )
        )
    return features


def parse_noaa_tsunamis(payload: dict) -> list[dict]:
    features = []
    for rec in payload.get("items") or []:
        lat = rec.get("latitude")
        lng = rec.get("longitude")
        if lat is None or lng is None:
            continue
        year = rec.get("year")
        month = rec.get("month") or 1
        day = rec.get("day") or 1
        try:
            time_iso = datetime(int(year), int(month), int(day), tzinfo=timezone.utc).isoformat()
        except (TypeError, ValueError):
            time_iso = str(year) if year else None
        place = rec.get("locationName") or rec.get("country") or "Tsunami event"
        country = rec.get("country") or ""
        height = rec.get("maxWaterHeight")
        mag = rec.get("eqMagnitude")
        title = f"Tsunami — {place}"
        if country and country not in title:
            title = f"{title}, {country}"
        description = "Historical tsunami source from NOAA NCEI."
        if height is not None:
            description = f"{description} Max water height {height} m."
        features.append(
            as_feature(
                event_id=f"noaa-tsunami-{rec.get('id')}",
                hazard="tsunami",
                title=title,
                lat=float(lat),
                lng=float(lng),
                severity="high" if (height or 0) >= 3 else "moderate",
                source="NOAA NCEI",
                time_iso=time_iso,
                magnitude=float(mag) if mag is not None else None,
                url="https://www.ngdc.noaa.gov/hazel/view/hazards/tsunami/event-data",
                description=description,
                extra={"country": country, "max_water_height_m": height},
            )
        )
    return features


async def fetch_earthquakes() -> list[dict]:
    end = utc_now()
    start = end - timedelta(days=7)
    try:
        payload = await fetch_json(
            USGS_QUERY,
            {
                "format": "geojson",
                "starttime": start.strftime("%Y-%m-%d"),
                "endtime": end.strftime("%Y-%m-%d"),
                "minmagnitude": "4.5",
                "orderby": "time",
            },
        )
    except NETWORK_ERRORS:
        payload = await fetch_json(USGS_WEEK_45)
    return parse_usgs_features(payload, tsunami_only=False)


async def fetch_tsunamis() -> list[dict]:
    end = utc_now()
    usgs_start = end - timedelta(days=30)
    gdacs_start = end - timedelta(days=365)
    usgs_payload, gdacs_payload, noaa_payload = await asyncio.gather(
        fetch_json(
            USGS_QUERY,
            {
                "format": "geojson",
                "starttime": usgs_start.strftime("%Y-%m-%d"),
                "endtime": end.strftime("%Y-%m-%d"),
                "minmagnitude": "6.0",
                "orderby": "time",
            },
        ),
        fetch_json(
            GDACS_SEARCH,
            {
                "eventlist": "TS",
                "fromdate": gdacs_start.strftime("%Y-%m-%d"),
                "todate": end.strftime("%Y-%m-%d"),
            },
        ),
        fetch_json(NOAA_TSUNAMI, {"minYear": "2000", "maxYear": str(end.year)}),
        return_exceptions=True,
    )
    features: list[dict] = []
    if not isinstance(usgs_payload, Exception):
        features.extend(parse_usgs_features(usgs_payload, tsunami_only=True))
    if not isinstance(gdacs_payload, Exception):
        features.extend(parse_gdacs(gdacs_payload, "tsunami"))
    if not isinstance(noaa_payload, Exception):
        features.extend(parse_noaa_tsunamis(noaa_payload))
    return features


async def fetch_floods() -> list[dict]:
    end = utc_now()
    gdacs_start = end - timedelta(days=180)
    eonet_payload, gdacs_payload = await asyncio.gather(
        fetch_json(EONET_FLOODS, {"category": "floods", "days": 120, "status": "all"}),
        fetch_json(
            GDACS_SEARCH,
            {
                "eventlist": "FL",
                "fromdate": gdacs_start.strftime("%Y-%m-%d"),
                "todate": end.strftime("%Y-%m-%d"),
            },
        ),
        return_exceptions=True,
    )
    features: list[dict] = []
    if not isinstance(eonet_payload, Exception):
        features.extend(parse_eonet_floods(eonet_payload))
    if not isinstance(gdacs_payload, Exception):
        features.extend(parse_gdacs(gdacs_payload, "flood"))
    return features


def events_from_features(features: list[dict]) -> list[dict]:
    events = []
    for feature in features:
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or [None, None]
        events.append({**props, "lng": coords[0], "lat": coords[1]})
    events.sort(key=lambda item: item.get("time") or "", reverse=True)
    return events


async def load_hazards() -> dict:
    async def _load():
        quakes, tsunamis, floods = await asyncio.gather(
            fetch_earthquakes(),
            fetch_tsunamis(),
            fetch_floods(),
            return_exceptions=True,
        )

        errors = {}
        if isinstance(quakes, Exception):
            errors["earthquake"] = str(quakes)
            quakes = (read_geojson("earthquakes.geojson") or {}).get("features") or []
        else:
            write_geojson("earthquakes.geojson", collection(quakes))
        if isinstance(tsunamis, Exception):
            errors["tsunami"] = str(tsunamis)
            tsunamis = (read_geojson("tsunamis.geojson") or {}).get("features") or []
        else:
            write_geojson("tsunamis.geojson", collection(tsunamis))
        if isinstance(floods, Exception):
            errors["flood"] = str(floods)
            floods = (read_geojson("floods.geojson") or {}).get("features") or []
        else:
            write_geojson("floods.geojson", collection(floods))

        all_features = quakes + tsunamis + floods
        return {
            "updated_at": iso(utc_now()),
            "counts": {
                "earthquake": len(quakes),
                "tsunami": len(tsunamis),
                "flood": len(floods),
                "total": len(all_features),
            },
            "events": events_from_features(all_features),
            "geojson": {
                "earthquake": collection(quakes),
                "tsunami": collection(tsunamis),
                "flood": collection(floods),
            },
            "sources": {
                "earthquake": ["USGS"],
                "tsunami": ["USGS tsunami flag", "NOAA NCEI", "GDACS"],
                "flood": ["NASA EONET", "GDACS"],
            },
            "errors": errors,
        }

    return await cached("hazards", _load)
