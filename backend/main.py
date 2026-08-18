from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps

from cases import (
    INCIDENT_TYPES,
    STATUSES,
    UPLOAD_DIR,
    attach_report,
    cases_geojson,
    create_case,
    ensure_dirs,
    find_duplicate,
    get_case,
    list_cases,
    save_case,
    update_case,
)
from detect import detect_image
from hazards import load_hazards
from layers import load_air_quality, load_environment, load_weather, satellite_config
from places import reverse_geocode, search_places
from report import build_full_report
from routing import PHONE_NOTICE, TEAMS as TEAM_META, format_location, route_for

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
ensure_dirs()

app = FastAPI(title="EarthRelay API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")
FRONTEND_DIST = ROOT / "frontend" / "dist"


@app.get("/health")
def health():
    return {"status": "healthy"}


@app.get("/api")
def api_root():
    return {
        "project": "EarthRelay",
        "status": "online",
        "official": True,
        "phone_notice": PHONE_NOTICE,
        "teams": list(TEAM_META.values()),
        "layers": [
            "mapbox",
            "weather",
            "air-quality",
            "wildlife",
            "protected-areas",
            "satellite",
            "earthquakes",
            "tsunamis",
            "floods",
            "cases",
        ],
    }


@app.get("/api/map-data")
async def map_data():
    hazards = await load_hazards()
    environment = await load_environment()
    cases = cases_geojson()
    return {
        "updated_at": hazards["updated_at"],
        "counts": {
            **hazards["counts"],
            **environment["counts"],
            "case": len(cases.get("features") or []),
        },
        "events": hazards["events"]
        + _events_from_collection(environment["wildlife"], "wildlife")
        + _events_from_collection(environment["protected"], "protected")
        + _events_from_collection(cases, "case"),
        "geojson": {
            **hazards["geojson"],
            "wildlife": environment["wildlife"],
            "protected": environment["protected"],
            "case": cases,
        },
        "satellite": environment["satellite"],
        "sources": {**hazards["sources"], **environment["sources"]},
        "errors": hazards["errors"],
    }


@app.get("/api/hazards")
async def hazards():
    return await load_hazards()


@app.get("/api/hazards/earthquakes")
async def earthquakes():
    return await _hazard_slice("earthquake")


@app.get("/api/hazards/tsunamis")
async def tsunamis():
    return await _hazard_slice("tsunami")


@app.get("/api/hazards/floods")
async def floods():
    return await _hazard_slice("flood")


@app.get("/api/weather")
async def weather(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    try:
        return await load_weather(lat, lng)
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc)) from exc


@app.get("/api/air-quality")
async def air_quality(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    try:
        return await load_air_quality(lat, lng)
    except Exception as extra:
        raise HTTPException(status_code=502, detail=str(extra)) from extra


@app.get("/api/satellite")
def satellite():
    return satellite_config()


@app.get("/api/places")
def places(q: str = Query("", min_length=0, max_length=80), limit: int = Query(12, ge=1, le=12)):
    return {"query": q, "places": search_places(q, limit)}


@app.get("/api/reverse")
def reverse(lat: float = Query(..., ge=-90, le=90), lng: float = Query(..., ge=-180, le=180)):
    street = reverse_geocode(lat, lng)
    return {"lat": lat, "lng": lng, "address": format_location(lat, lng, street or None), "street": street}


@app.get("/api/inbox")
def inbox(team: str = Query("", max_length=40)):
    cases = list_cases()
    if team and team != "all":
        cases = [item for item in cases if item.get("routed_to") == team]
    return {"teams": list(TEAM_META.values()), "phone_notice": PHONE_NOTICE, "cases": cases}


@app.get("/api/cases")
def cases():
    return {"cases": list_cases()}


@app.get("/api/cases/{case_id}")
def case_detail(case_id: str):
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.post("/api/cases")
async def open_case(
    image: UploadFile = File(...),
    title: str = Form(""),
    incident_type: str = Form("other"),
    notes: str = Form(""),
    lat: str = Form(""),
    lng: str = Form(""),
    reporter_role: str = Form("citizen"),
    reporter_name: str = Form(""),
    phone: str = Form(""),
    first_name: str = Form(""),
    last_name: str = Form(""),
    location_source: str = Form(""),
):
    if incident_type not in INCIDENT_TYPES:
        incident_type = "other"
    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image")

    parsed_lat = _float_or_none(lat)
    parsed_lng = _float_or_none(lng)
    address = ""
    if parsed_lat is not None and parsed_lng is not None:
        street = reverse_geocode(parsed_lat, parsed_lng)
        address = format_location(parsed_lat, parsed_lng, street or None)
    duplicate = find_duplicate(parsed_lat, parsed_lng, incident_type)
    target = duplicate or create_case(
        title=title or image.filename or "Untitled case",
        incident_type=incident_type,
        notes=notes,
        lat=parsed_lat,
        lng=parsed_lng,
        original_name=image.filename or "upload.jpg",
        detection={"status": "pending"},
        reporter_role=reporter_role,
        reporter_name=reporter_name or f"{first_name} {last_name}".strip(),
        address=address,
        phone=phone,
        first_name=first_name,
        last_name=last_name,
        location_source=location_source,
    )
    case_id = target["id"]
    stamp = str(len(target.get("reports") or []))
    original_path = UPLOAD_DIR / f"{case_id}_{stamp}_original.jpg"
    annotated_path = UPLOAD_DIR / f"{case_id}_{stamp}_annotated.jpg"
    if not duplicate:
        original_path = UPLOAD_DIR / f"{case_id}_original.jpg"
        annotated_path = UPLOAD_DIR / f"{case_id}_annotated.jpg"
    _save_jpeg(contents, original_path)

    try:
        detection = detect_image(original_path, annotated_path)
    except Exception as exc:
        detection = {"error": str(exc), "count": 0, "detections": [], "labels": []}

    weather = None
    if parsed_lat is not None and parsed_lng is not None:
        try:
            weather = await load_weather(parsed_lat, parsed_lng)
        except Exception:
            weather = None

    report = await build_full_report(
        image_path=original_path,
        detection=detection,
        incident_type=incident_type,
        lat=parsed_lat,
        lng=parsed_lng,
        weather=weather,
        report_count=(target.get("report_count") or 1) + (1 if duplicate else 0),
    )

    if duplicate:
        rel_original = f"/uploads/{original_path.name}"
        rel_annotated = f"/uploads/{annotated_path.name}"
        target = attach_report(
            target,
            reporter_role=reporter_role,
            notes=notes,
            image_url=rel_original,
            annotated_url=rel_annotated,
            original_name=image.filename or "upload.jpg",
        )
        target["merged"] = True
        target["duplicate_distance_m"] = duplicate.get("_duplicate_distance_m")
    else:
        labels = ", ".join(
            item.get("label") if isinstance(item, dict) else str(item)
            for item in (report.get("detected") or [])[:3]
        )
        target["title"] = title or f"{incident_type.replace('_', ' ')} — {labels or 'site report'}"
        target["image_url"] = f"/uploads/{original_path.name}"
        target["annotated_url"] = f"/uploads/{annotated_path.name}"

    target["detection"] = detection
    target["report"] = report
    target["priority"] = report.get("priority")
    target["phone_notice"] = PHONE_NOTICE
    if not target.get("routed_to"):
        routed = route_for(incident_type)
        target["routed_to"] = routed["id"]
        target["routed_label"] = routed["label"]
        target["assigned_team"] = routed["id"]
    return save_case(target)


@app.patch("/api/cases/{case_id}")
async def patch_case(
    case_id: str,
    status: str | None = Form(None),
    notes: str | None = Form(None),
    title: str | None = Form(None),
    lat: str | None = Form(None),
    lng: str | None = Form(None),
    assigned_team: str | None = Form(None),
    detail: str | None = Form(None),
    phone: str | None = Form(None),
    location_source: str | None = Form(None),
    location_accuracy_m: str | None = Form(None),
    claimed_by: str | None = Form(None),
    address: str | None = Form(None),
):
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    parsed_lat = _float_or_none(lat) if lat is not None else None
    parsed_lng = _float_or_none(lng) if lng is not None else None
    location_text = address
    if parsed_lat is not None and parsed_lng is not None and not location_text:
        street = reverse_geocode(parsed_lat, parsed_lng)
        location_text = format_location(parsed_lat, parsed_lng, street or None)
    case = update_case(
        case_id,
        status=status,
        notes=notes,
        title=title,
        lat=parsed_lat,
        lng=parsed_lng,
        assigned_team=assigned_team,
        detail=detail,
        phone=phone,
        location_source=location_source,
        location_accuracy_m=_float_or_none(location_accuracy_m),
        claimed_by=claimed_by,
        address=location_text,
    )
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


async def _hazard_slice(kind: str) -> dict:
    payload = await load_hazards()
    return {
        "updated_at": payload["updated_at"],
        "count": payload["counts"][kind],
        "events": [event for event in payload["events"] if event["hazard"] == kind],
        "geojson": payload["geojson"][kind],
        "sources": payload["sources"][kind],
        "error": payload["errors"].get(kind),
    }


def _events_from_collection(collection: dict, hazard: str) -> list[dict]:
    events = []
    for feature in collection.get("features") or []:
        props = feature.get("properties") or {}
        coords = (feature.get("geometry") or {}).get("coordinates") or [None, None]
        events.append(
            {
                "id": props.get("id"),
                "hazard": hazard,
                "title": props.get("title"),
                "severity": props.get("severity"),
                "source": props.get("source"),
                "time": props.get("time"),
                "url": props.get("url"),
                "description": props.get("description") or props.get("title"),
                "lng": coords[0],
                "lat": coords[1],
            }
        )
    return events


def _float_or_none(value: str | None) -> float | None:
    if value is None or value == "":
        return None
    try:
        return float(value)
    except ValueError:
        return None


def _save_jpeg(contents: bytes, path: Path) -> None:
    from io import BytesIO

    image = Image.open(BytesIO(contents))
    image = ImageOps.exif_transpose(image)
    if image.mode not in ("RGB", "L"):
        image = image.convert("RGB")
    else:
        image = image.convert("RGB")
    image.save(path, format="JPEG", quality=90)


@app.get("/")
def spa_root():
    return spa("")


@app.get("/{full_path:path}")
def spa(full_path: str):
    """One official URL: the built app and the API share this host."""
    if full_path.startswith("api/") or full_path.startswith("uploads/"):
        raise HTTPException(status_code=404, detail="Not found")
    if not FRONTEND_DIST.exists():
        return {
            "project": "EarthRelay",
            "status": "online",
            "hint": "Frontend not built. Run the Vite app on port 5173, or npm run build in frontend/.",
        }
    candidate = FRONTEND_DIST / full_path
    if full_path and candidate.is_file():
        return FileResponse(candidate)
    index = FRONTEND_DIST / "index.html"
    if index.exists():
        return FileResponse(index)
    raise HTTPException(status_code=404, detail="App not built")
