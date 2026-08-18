"""Place search for the map. Local country index for instant letters, Photon for the rest."""

from __future__ import annotations

from urllib.parse import quote

from net import NETWORK_ERRORS, fetch_json_sync

PHOTON_URL = "https://photon.komoot.io/api/"
PHOTON_REVERSE_URL = "https://photon.komoot.io/reverse"
NOMINATIM_URL = "https://nominatim.openstreetmap.org/search"
NOMINATIM_REVERSE_URL = "https://nominatim.openstreetmap.org/reverse"

# Centroids for prefix search: type "n" → Norway, Nigeria, Nepal, …
COUNTRIES = [
    ("Afghanistan", 33.94, 67.71, 5),
    ("Albania", 41.15, 20.17, 7),
    ("Algeria", 28.03, 1.66, 5),
    ("Andorra", 42.51, 1.52, 10),
    ("Angola", -11.2, 17.87, 5),
    ("Argentina", -38.42, -63.62, 4),
    ("Armenia", 40.07, 45.04, 7),
    ("Australia", -25.27, 133.78, 4),
    ("Austria", 47.52, 14.55, 6),
    ("Azerbaijan", 40.14, 47.58, 6),
    ("Bahrain", 26.07, 50.56, 9),
    ("Bangladesh", 23.68, 90.36, 6),
    ("Belarus", 53.71, 27.95, 6),
    ("Belgium", 50.5, 4.47, 7),
    ("Belize", 17.19, -88.5, 7),
    ("Benin", 9.31, 2.32, 6),
    ("Bhutan", 27.51, 90.43, 7),
    ("Bolivia", -16.29, -63.59, 5),
    ("Bosnia and Herzegovina", 43.92, 17.68, 7),
    ("Botswana", -22.33, 24.68, 6),
    ("Brazil", -14.24, -51.93, 4),
    ("Brunei", 4.54, 114.73, 8),
    ("Bulgaria", 42.73, 25.49, 6),
    ("Burkina Faso", 12.24, -1.56, 6),
    ("Burundi", -3.37, 29.92, 8),
    ("Cambodia", 12.57, 104.99, 6),
    ("Cameroon", 7.37, 12.35, 6),
    ("Canada", 56.13, -106.35, 3),
    ("Chile", -35.68, -71.54, 4),
    ("China", 35.86, 104.2, 4),
    ("Colombia", 4.57, -74.3, 5),
    ("Costa Rica", 9.75, -83.75, 7),
    ("Croatia", 45.1, 15.2, 7),
    ("Cuba", 21.52, -77.78, 6),
    ("Cyprus", 35.13, 33.43, 8),
    ("Czechia", 49.82, 15.47, 7),
    ("Denmark", 56.26, 9.5, 6),
    ("Dominican Republic", 18.74, -70.16, 7),
    ("Ecuador", -1.83, -78.18, 6),
    ("Egypt", 26.82, 30.8, 5),
    ("El Salvador", 13.79, -88.9, 8),
    ("Estonia", 58.6, 25.01, 7),
    ("Ethiopia", 9.15, 40.49, 5),
    ("Fiji", -17.71, 178.07, 7),
    ("Finland", 61.92, 25.75, 5),
    ("France", 46.23, 2.21, 5),
    ("Gabon", -0.8, 11.61, 6),
    ("Georgia", 42.32, 43.36, 7),
    ("Germany", 51.17, 10.45, 5),
    ("Ghana", 7.95, -1.02, 6),
    ("Greece", 39.07, 21.82, 6),
    ("Greenland", 71.71, -42.6, 3),
    ("Guatemala", 15.78, -90.23, 7),
    ("Haiti", 18.97, -72.29, 8),
    ("Honduras", 15.2, -86.24, 7),
    ("Hungary", 47.16, 19.5, 7),
    ("Iceland", 64.96, -19.02, 5),
    ("India", 20.59, 78.96, 4),
    ("Indonesia", -0.79, 113.92, 4),
    ("Iran", 32.43, 53.69, 5),
    ("Iraq", 33.22, 43.68, 6),
    ("Ireland", 53.14, -7.69, 6),
    ("Israel", 31.05, 34.85, 7),
    ("Italy", 41.87, 12.57, 5),
    ("Jamaica", 18.11, -77.3, 8),
    ("Japan", 36.2, 138.25, 5),
    ("Jordan", 30.59, 36.24, 7),
    ("Kazakhstan", 48.02, 66.92, 4),
    ("Kenya", -0.02, 37.91, 6),
    ("Kuwait", 29.31, 47.48, 8),
    ("Kyrgyzstan", 41.2, 74.77, 6),
    ("Laos", 19.86, 102.5, 6),
    ("Latvia", 56.88, 24.6, 7),
    ("Lebanon", 33.85, 35.86, 8),
    ("Liberia", 6.43, -9.43, 7),
    ("Libya", 26.34, 17.23, 5),
    ("Lithuania", 55.17, 23.88, 7),
    ("Luxembourg", 49.82, 6.13, 9),
    ("Madagascar", -18.77, 46.87, 5),
    ("Malawi", -13.25, 34.3, 6),
    ("Malaysia", 4.21, 101.98, 6),
    ("Maldives", 3.2, 73.22, 7),
    ("Mali", 17.57, -4.0, 5),
    ("Malta", 35.94, 14.38, 10),
    ("Mexico", 23.63, -102.55, 4),
    ("Moldova", 47.41, 28.37, 7),
    ("Mongolia", 46.86, 103.85, 5),
    ("Montenegro", 42.71, 19.37, 8),
    ("Morocco", 31.79, -7.09, 5),
    ("Mozambique", -18.67, 35.53, 5),
    ("Myanmar", 21.91, 95.96, 5),
    ("Namibia", -22.96, 18.49, 5),
    ("Nepal", 28.39, 84.12, 6),
    ("Netherlands", 52.13, 5.29, 7),
    ("New Zealand", -40.9, 174.89, 5),
    ("Nicaragua", 12.87, -85.21, 6),
    ("Niger", 17.61, 8.08, 5),
    ("Nigeria", 9.08, 8.68, 5),
    ("North Korea", 40.34, 127.51, 6),
    ("North Macedonia", 41.61, 21.75, 8),
    ("Norway", 60.47, 8.47, 4.5),
    ("Oman", 21.51, 55.92, 6),
    ("Pakistan", 30.38, 69.35, 5),
    ("Panama", 8.54, -80.78, 7),
    ("Papua New Guinea", -6.31, 143.96, 6),
    ("Paraguay", -23.44, -58.44, 6),
    ("Peru", -9.19, -75.02, 5),
    ("Philippines", 12.88, 121.77, 5),
    ("Poland", 51.92, 19.15, 6),
    ("Portugal", 39.4, -8.22, 6),
    ("Qatar", 25.35, 51.18, 8),
    ("Romania", 45.94, 24.97, 6),
    ("Russia", 61.52, 105.32, 3),
    ("Rwanda", -1.94, 29.87, 8),
    ("Saudi Arabia", 23.89, 45.08, 5),
    ("Senegal", 14.5, -14.45, 6),
    ("Serbia", 44.02, 21.01, 7),
    ("Sierra Leone", 8.46, -11.78, 7),
    ("Singapore", 1.35, 103.82, 11),
    ("Slovakia", 48.67, 19.7, 7),
    ("Slovenia", 46.15, 14.99, 8),
    ("Somalia", 5.15, 46.2, 5),
    ("South Africa", -30.56, 22.94, 5),
    ("South Korea", 35.91, 127.77, 6),
    ("South Sudan", 6.88, 31.31, 6),
    ("Spain", 40.46, -3.75, 5),
    ("Sri Lanka", 7.87, 80.77, 7),
    ("Sudan", 12.86, 30.22, 5),
    ("Sweden", 60.13, 18.64, 4.5),
    ("Switzerland", 46.82, 8.23, 7),
    ("Syria", 34.8, 38.0, 6),
    ("Taiwan", 23.7, 121.0, 7),
    ("Tajikistan", 38.86, 71.28, 6),
    ("Tanzania", -6.37, 34.89, 5),
    ("Thailand", 15.87, 100.99, 5),
    ("Togo", 8.62, 0.82, 7),
    ("Tunisia", 33.89, 9.54, 6),
    ("Turkey", 38.96, 35.24, 5),
    ("Turkmenistan", 38.97, 59.56, 5),
    ("Uganda", 1.37, 32.29, 6),
    ("Ukraine", 48.38, 31.17, 5),
    ("United Arab Emirates", 23.42, 53.85, 6),
    ("United Kingdom", 55.38, -3.44, 5),
    ("United States", 37.09, -95.71, 3.5),
    ("Uruguay", -32.52, -55.77, 6),
    ("Uzbekistan", 41.38, 64.59, 5),
    ("Venezuela", 6.42, -66.59, 5),
    ("Vietnam", 14.06, 108.28, 5),
    ("Yemen", 15.55, 48.52, 6),
    ("Zambia", -13.13, 27.85, 6),
    ("Zimbabwe", -19.02, 29.15, 6),
]

CITIES = [
    ("Karachi", "Pakistan", 24.86, 67.0, 10),
    ("Lahore", "Pakistan", 31.52, 74.36, 10),
    ("Islamabad", "Pakistan", 33.68, 73.04, 11),
    ("Peshawar", "Pakistan", 34.02, 71.52, 11),
    ("Quetta", "Pakistan", 30.18, 67.0, 11),
    ("Oslo", "Norway", 59.91, 10.75, 10),
    ("Bergen", "Norway", 60.39, 5.32, 11),
    ("Lagos", "Nigeria", 6.52, 3.38, 10),
    ("Abuja", "Nigeria", 9.08, 7.4, 11),
    ("Nairobi", "Kenya", -1.29, 36.82, 11),
    ("New York", "United States", 40.71, -74.01, 10),
    ("New Delhi", "India", 28.61, 77.21, 10),
    ("Kathmandu", "Nepal", 27.72, 85.32, 11),
    ("Amsterdam", "Netherlands", 52.37, 4.9, 11),
    ("London", "United Kingdom", 51.51, -0.13, 10),
    ("Paris", "France", 48.86, 2.35, 11),
    ("Tokyo", "Japan", 35.68, 139.69, 10),
    ("Beijing", "China", 39.9, 116.4, 10),
    ("Dubai", "United Arab Emirates", 25.2, 55.27, 10),
    ("Istanbul", "Turkey", 41.01, 28.98, 10),
    ("Cairo", "Egypt", 30.04, 31.24, 10),
    ("Cape Town", "South Africa", -33.92, 18.42, 10),
    ("Sydney", "Australia", -33.87, 151.21, 10),
    ("Toronto", "Canada", 43.65, -79.38, 10),
    ("Mexico City", "Mexico", 19.43, -99.13, 10),
    ("São Paulo", "Brazil", -23.55, -46.63, 10),
    ("Nanjing", "China", 32.06, 118.8, 10),
    ("Naples", "Italy", 40.85, 14.27, 11),
]


def _place(name: str, lat: float, lng: float, zoom: float, kind: str, country: str | None = None) -> dict:
    label = f"{name}, {country}" if country and country != name else name
    return {
        "id": f"{kind}:{name}:{country or name}".lower(),
        "name": name,
        "label": label,
        "kind": kind,
        "country": country or name,
        "lat": lat,
        "lng": lng,
        "zoom": zoom,
        "bbox": None,
    }


def _local_matches(query: str, limit: int) -> list[dict]:
    q = query.lower()

    def hit(name: str, extra: str = "") -> bool:
        text = name.lower()
        blob = f"{text} {extra.lower()}".strip()
        if len(q) == 1:
            return text.startswith(q)
        return blob.startswith(q) or q in blob

    hits = []
    for name, lat, lng, zoom in COUNTRIES:
        if hit(name):
            hits.append(_place(name, lat, lng, zoom, "country"))
    for name, country, lat, lng, zoom in CITIES:
        if hit(name, country):
            hits.append(_place(name, lat, lng, zoom, "city", country))
    starts = [item for item in hits if item["name"].lower().startswith(q)]
    rest = [item for item in hits if item not in starts]
    return (starts + rest)[:limit]


def _bbox(extent) -> list[float] | None:
    if not extent or len(extent) < 4:
        return None
    lons = [float(extent[0]), float(extent[2])]
    lats = [float(extent[1]), float(extent[3])]
    return [min(lons), min(lats), max(lons), max(lats)]


def _from_photon(feature: dict) -> dict | None:
    props = feature.get("properties") or {}
    coords = (feature.get("geometry") or {}).get("coordinates") or []
    if len(coords) < 2:
        return None
    lng, lat = float(coords[0]), float(coords[1])
    name = props.get("name") or props.get("city") or props.get("country")
    if not name:
        return None
    country = props.get("country")
    kind = props.get("osm_value") or props.get("type") or "place"
    zoom = 4.8 if kind == "country" else 7 if kind in {"state", "region"} else 11
    bbox = _bbox(props.get("extent"))
    if bbox:
        span = max(bbox[2] - bbox[0], bbox[3] - bbox[1])
        if span > 20:
            zoom = 4
        elif span > 8:
            zoom = 5.5
        elif span > 2:
            zoom = 7
        else:
            zoom = 11
    parts = [name]
    for part in (props.get("state"), country):
        if part and part not in parts:
            parts.append(part)
    return {
        "id": f"photon:{props.get('osm_id') or name}",
        "name": name,
        "label": ", ".join(parts),
        "kind": kind,
        "country": country,
        "lat": lat,
        "lng": lng,
        "zoom": zoom,
        "bbox": bbox,
    }


def _photon(query: str, limit: int) -> list[dict]:
    try:
        payload = fetch_json_sync(PHOTON_URL, {"q": query, "limit": str(limit), "lang": "en"}, timeout=8)
    except NETWORK_ERRORS:
        return _nominatim(query, limit)
    hits = []
    for feature in payload.get("features") or []:
        item = _from_photon(feature)
        if item:
            hits.append(item)
    return hits


def _nominatim(query: str, limit: int) -> list[dict]:
    try:
        rows = fetch_json_sync(
            f"{NOMINATIM_URL}?q={quote(query)}&format=json&limit={limit}&addressdetails=1",
            timeout=8,
        )
    except NETWORK_ERRORS:
        return []
    hits = []
    for row in rows or []:
        name = row.get("display_name")
        if not name:
            continue
        bbox = None
        raw = row.get("boundingbox")
        if raw and len(raw) == 4:
            south, north, west, east = (float(v) for v in raw)
            bbox = [west, south, east, north]
        hits.append(
            {
                "id": f"osm:{row.get('place_id')}",
                "name": name.split(",")[0],
                "label": name,
                "kind": row.get("type") or "place",
                "country": (row.get("address") or {}).get("country"),
                "lat": float(row["lat"]),
                "lng": float(row["lon"]),
                "zoom": 5 if row.get("type") == "country" else 10,
                "bbox": bbox,
            }
        )
    return hits


def _query_hit(item: dict, query: str) -> bool:
    q = query.lower()
    text = f"{item.get('name') or ''} {item.get('label') or ''}"
    tokens = text.lower().replace(",", " ").replace("-", " ").split()
    return any(token.startswith(q) for token in tokens)


def reverse_geocode(lat: float, lng: float) -> str:
    """Street-style address from GPS. Photon first, Nominatim backup."""
    try:
        payload = fetch_json_sync(
            PHOTON_REVERSE_URL,
            {"lat": str(lat), "lon": str(lng), "lang": "en"},
            timeout=8,
        )
        feature = (payload.get("features") or [None])[0]
        if feature:
            props = feature.get("properties") or {}
            parts = [
                props.get("name") or props.get("street") or props.get("housenumber"),
                props.get("street"),
                props.get("city") or props.get("town") or props.get("village") or props.get("county"),
                props.get("state"),
                props.get("country"),
            ]
            ordered = []
            for part in parts:
                if part and part not in ordered:
                    ordered.append(part)
            if ordered:
                return ", ".join(ordered)
    except NETWORK_ERRORS:
        pass
    try:
        row = fetch_json_sync(
            f"{NOMINATIM_REVERSE_URL}?lat={lat}&lon={lng}&format=json&zoom=18&addressdetails=1",
            timeout=8,
        )
        name = (row or {}).get("display_name")
        if name:
            return name
    except NETWORK_ERRORS:
        pass
    return ""


def search_places(query: str, limit: int = 12) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    limit = max(1, min(int(limit or 12), 12))
    local = _local_matches(q, limit)
    if len(q) < 2:
        return local
    remote = [item for item in _photon(q, limit) if _query_hit(item, q)]
    seen = set()
    merged = []
    for item in local + remote:
        if not item.get("name"):
            continue
        key = (item["name"].lower(), (item.get("country") or "").lower())
        if key in seen:
            continue
        seen.add(key)
        merged.append(item)
        if len(merged) >= limit:
            break
    return merged
