from pathlib import Path
import asyncio
import json
import os
import shutil
import uuid

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, Query, UploadFile
from pydantic import BaseModel, Field
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
    delete_case,
    ensure_dirs,
    find_duplicate,
    get_case,
    list_cases,
    nearby_cases,
    save_case,
    update_case,
)
from detect import detect_image
from hazards import load_hazards
from layers import load_environment, load_weather, satellite_config
from places import describe_location, search_places
from report import (
    analyze_scene,
    apply_gemini_scene,
    build_full_report,
    case_title,
    normalize_incident_type,
    resolve_incident_type,
    score_photo,
    should_call_gemini,
    unwrap_gemini,
)
from cloud import supabase_status
from field import assignment_payload, task_for, tasks_for
from mail import configured as mail_configured
from mail import send_invite
from routing import PHONE_NOTICE, TEAMS as TEAM_META, format_location, route_for
from volunteers import (
    NEED_LABELS,
    assignable,
    normalize_need,
    create_volunteer,
    get_volunteer,
    invite_volunteer,
    load_org,
    load_volunteers,
    public_org,
    save_org,
    session_for_email,
    session_for_org,
    setup_org_login,
    start_org_reset,
    complete_org_reset,
    set_org_recovery_email,
    change_org_password,
    start_volunteer_reset,
    complete_volunteer_reset,
    set_volunteer_password,
    change_volunteer_password,
    update_volunteer,
    delete_volunteer,
    public_volunteer,
)
from helpline import helpline_directory
from staff import allot_staff, DESK_LABELS, load_staff, next_cms_id, public_staff, ROLE_LABELS, change_staff_password, session_for_cms, set_staff_password, delete_staff

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env")
ensure_dirs()

# Index labeled eval photos for live reference matching (no CLI needed).
try:
    from eval.catalog import list_photo_entries, write_labels_csv
    from eval.reference import build_fingerprint_index

    _eval_rows = list_photo_entries()
    if _eval_rows:
        write_labels_csv(_eval_rows)
        build_fingerprint_index(force=False)
except Exception:
    pass

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
@app.get("/api/health")
def health():
    cloud = supabase_status()
    eval_count = 0
    try:
        from eval.reference import load_fingerprint_index

        eval_count = int((load_fingerprint_index() or {}).get("count") or 0)
    except Exception:
        eval_count = 0
    return {
        "status": "healthy",
        "supabase": cloud,
        "mail": mail_configured(),
        "eval_fingerprints": eval_count,
    }


@app.get("/api")
def api_root():
    return {
        "project": "EarthRelay",
        "status": "online",
        "official": True,
        "phone_notice": PHONE_NOTICE,
        "teams": list(TEAM_META.values()),
        "layers": [
            "openfreemap",
            "weather",
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


@app.get("/api/satellite")
def satellite():
    return satellite_config()


@app.get("/api/places")
def places(q: str = Query("", min_length=0, max_length=80), limit: int = Query(12, ge=1, le=12)):
    return {"query": q, "places": search_places(q, limit)}


@app.get("/api/reverse")
def reverse(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    nearby: int = Query(1, ge=0, le=1),
):
    detail = describe_location(lat, lng, include_nearby=bool(nearby))
    street = detail.get("label") or ""
    return {
        "lat": lat,
        "lng": lng,
        "address": format_location(lat, lng, street or None),
        "street": street,
        "road": detail.get("road") or "",
        "area": detail.get("area") or "",
        "city": detail.get("city") or "",
        "state": detail.get("state") or "",
        "country": detail.get("country") or "",
        "nearby": detail.get("nearby") or [],
    }


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


@app.get("/api/cases/{case_id}/nearby")
def case_nearby(case_id: str, radius_m: float = Query(1000)):
    if not get_case(case_id):
        raise HTTPException(status_code=404, detail="Case not found")
    return {"cases": nearby_cases(case_id, radius_m)}


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
    location_accuracy_m: str = Form(""),
):
    incident_type = normalize_incident_type(incident_type)
    if incident_type not in INCIDENT_TYPES:
        incident_type = "other"
    try:
        from phone import optional_phone

        phone = optional_phone(phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    contents = await image.read()
    if not contents:
        raise HTTPException(status_code=400, detail="Empty image")

    parsed_lat = _float_or_none(lat)
    parsed_lng = _float_or_none(lng)

    incoming_id = uuid.uuid4().hex[:12]
    tmp_original = UPLOAD_DIR / f"_tmp_{incoming_id}.jpg"
    tmp_annotated = UPLOAD_DIR / f"_tmp_{incoming_id}_ann.jpg"
    _save_jpeg(contents, tmp_original)
    try:
        detection = detect_image(tmp_original, tmp_annotated)
    except Exception as exc:
        detection = {"error": str(exc), "count": 0, "detections": [], "labels": []}
        try:
            shutil.copyfile(tmp_original, tmp_annotated)
        except OSError:
            pass

    scene = analyze_scene(tmp_original, detection.get("labels") or [])
    labels = detection.get("labels") or []

    async def _read_photo():
        if not should_call_gemini(scene, labels):
            return None
        return await asyncio.to_thread(
            score_photo,
            tmp_original,
            {
                "incident_type": incident_type,
                "labels": labels,
                "weather": None,
                "ecosystem": {},
            },
            scene,
            labels,
        )

    async def _read_place():
        if parsed_lat is None or parsed_lng is None:
            return {}
        return await asyncio.to_thread(describe_location, parsed_lat, parsed_lng)

    async def _read_weather():
        if parsed_lat is None or parsed_lng is None:
            return None
        try:
            return await load_weather(parsed_lat, parsed_lng)
        except Exception:
            return None

    gemini_early, detail, weather = await asyncio.gather(_read_photo(), _read_place(), _read_weather())
    gemini_usable, _flash_err = unwrap_gemini(gemini_early)
    scene = apply_gemini_scene(scene, gemini_usable)
    resolved_type, type_match, type_note = resolve_incident_type(
        incident_type, scene, labels, gemini_usable
    )
    reporter_type = incident_type
    incident_type = resolved_type

    address = ""
    nearby = []
    location_parts = {}
    if detail:
        street = detail.get("label") or ""
        address = format_location(parsed_lat, parsed_lng, street or None) if parsed_lat is not None else ""
        nearby = detail.get("nearby") or []
        location_parts = {
            "road": detail.get("road") or "",
            "area": detail.get("area") or "",
            "city": detail.get("city") or "",
            "state": detail.get("state") or "",
            "country": detail.get("country") or "",
        }

    duplicate = find_duplicate(parsed_lat, parsed_lng, incident_type)
    reporter_notes = (notes or "").strip()
    filer = (reporter_name or f"{first_name} {last_name}".strip()).strip().lower()
    same_reporter = False
    if duplicate:
        prev_name = (duplicate.get("reporter_name") or "").strip().lower()
        same_reporter = bool(filer and prev_name and filer == prev_name)
        prev = (duplicate.get("notes") or "").strip()
        if reporter_notes and prev and reporter_notes not in prev:
            reporter_notes = f"{prev}\n{reporter_notes}"
        elif prev and not reporter_notes:
            reporter_notes = prev
    target = duplicate or create_case(
        title=title or image.filename or "Untitled case",
        incident_type=incident_type,
        notes=reporter_notes if duplicate else notes,
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
        location_accuracy_m=_float_or_none(location_accuracy_m),
        nearby=nearby,
        location_parts=location_parts,
    )
    if duplicate:
        if address:
            target["address"] = address
        if nearby:
            target["nearby"] = nearby
        if location_parts:
            target["location_parts"] = location_parts
        if reporter_notes:
            target["notes"] = reporter_notes
        # Keep the case pin on the newest live GPS so volunteers get the reporting site.
        if parsed_lat is not None and parsed_lng is not None:
            target["lat"] = parsed_lat
            target["lng"] = parsed_lng
        if location_source:
            target["location_source"] = location_source
    acc = _float_or_none(location_accuracy_m)
    if acc is not None:
        target["location_accuracy_m"] = acc
    case_id = target["id"]
    stamp = str(len(target.get("reports") or []))
    original_path = UPLOAD_DIR / f"{case_id}_{stamp}_original.jpg"
    annotated_path = UPLOAD_DIR / f"{case_id}_{stamp}_annotated.jpg"
    if not duplicate:
        original_path = UPLOAD_DIR / f"{case_id}_original.jpg"
        annotated_path = UPLOAD_DIR / f"{case_id}_annotated.jpg"
    try:
        shutil.move(str(tmp_original), str(original_path))
        if tmp_annotated.exists():
            shutil.move(str(tmp_annotated), str(annotated_path))
        elif not annotated_path.exists():
            shutil.copyfile(str(original_path), str(annotated_path))
    except OSError:
        _save_jpeg(contents, original_path)

    report = await build_full_report(
        image_path=original_path,
        detection=detection,
        incident_type=incident_type,
        lat=parsed_lat,
        lng=parsed_lng,
        weather=weather,
        report_count=(target.get("report_count") or 1) + (1 if duplicate else 0),
        scene=scene,
        type_match=type_match,
        type_note=type_note,
        reporter_type=reporter_type,
        gemini=gemini_early,
        reporter_notes=reporter_notes,
        merged_other_reporter=bool(duplicate) and not same_reporter,
    )
    incident_type = report.get("incident_type") or incident_type

    rel_original = f"/uploads/{original_path.name}"
    rel_annotated = f"/uploads/{annotated_path.name}"
    if duplicate:
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
    target["title"] = title or case_title(incident_type, detection, report)
    target["image_url"] = rel_original
    target["annotated_url"] = rel_annotated
    target["incident_type"] = incident_type

    target["detection"] = detection
    target["report"] = report
    target["priority"] = report.get("priority")
    target["phone_notice"] = PHONE_NOTICE
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
    activity_kind: str | None = Form(None),
    activity_result: str | None = Form(None),
    activity_by: str | None = Form(None),
    priority: str | None = Form(None),
    assignment_status: str | None = Form(None),
):
    if status and status not in STATUSES:
        raise HTTPException(status_code=400, detail="Invalid status")
    parsed_lat = _float_or_none(lat) if lat is not None else None
    parsed_lng = _float_or_none(lng) if lng is not None else None
    location_text = address
    nearby = None
    location_parts = None
    if parsed_lat is not None and parsed_lng is not None and not location_text:
        place = describe_location(parsed_lat, parsed_lng)
        nearby = place.get("nearby") or []
        location_parts = {
            "road": place.get("road") or "",
            "area": place.get("area") or "",
            "city": place.get("city") or "",
            "state": place.get("state") or "",
            "country": place.get("country") or "",
        }
        location_text = format_location(parsed_lat, parsed_lng, place.get("label") or None)
    try:
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
            nearby=nearby,
            location_parts=location_parts,
            activity_kind=activity_kind,
            activity_result=activity_result,
            activity_by=activity_by,
            priority=priority,
            assignment_status=assignment_status,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    return case


@app.delete("/api/cases/{case_id}")
def cases_delete(case_id: str):
    delete_case(case_id)
    return {"ok": True, "id": case_id}


class AssignIn(BaseModel):
    need: str
    responder_id: str
    assigned_by: str = ""


class VolunteerIn(BaseModel):
    name: str = ""
    email: str = ""
    phone: str = ""
    organization: str = ""
    capabilities: list[str] = Field(default_factory=list)
    access: dict | None = None
    status: str | None = None
    password: str = ""


class SessionIn(BaseModel):
    email: str
    password: str = ""
    phone: str = ""


class VolunteerForgotIn(BaseModel):
    email: str
    phone: str


class VolunteerResetIn(BaseModel):
    email: str
    phone: str
    code: str
    password: str


class VolunteerPasswordIn(BaseModel):
    password: str


class VolunteerChangePasswordIn(BaseModel):
    current_password: str
    password: str


class StaffSessionIn(BaseModel):
    cms_id: str
    password: str = ""
    phone: str = ""


class StaffAllotIn(BaseModel):
    name: str
    phone: str
    email: str = ""
    role: str = "case_officer"
    desk: str = "general"
    salary_pkr: int = 80000
    password: str = ""
    cms_id: str = ""
    joined_on: str = ""


class StaffPasswordIn(BaseModel):
    password: str


class StaffChangePasswordIn(BaseModel):
    current_password: str
    password: str


class OrgIn(BaseModel):
    name: str | None = None
    access_defaults: dict | None = None


class OrgSessionIn(BaseModel):
    username: str
    password: str = ""


class OrgSetupIn(BaseModel):
    username: str
    password: str
    name: str = ""
    email: str = ""


class OrgForgotIn(BaseModel):
    username: str
    email: str


class OrgResetIn(BaseModel):
    username: str
    email: str
    code: str
    password: str


class OrgRecoveryIn(BaseModel):
    username: str
    password: str
    email: str


class OrgPasswordIn(BaseModel):
    username: str
    password: str
    new_password: str


@app.post("/api/cases/{case_id}/assign")
def assign_response(case_id: str, body: AssignIn):
    case = get_case(case_id)
    if not case:
        raise HTTPException(status_code=404, detail="Case not found")
    need = normalize_need(body.need)
    if not need:
        raise HTTPException(status_code=400, detail="Unknown response need")
    responder = get_volunteer(body.responder_id)
    if not responder or responder.get("status") not in ("active", "invited"):
        raise HTTPException(status_code=400, detail="Responder is not active")
    org = load_org()
    payload = assignment_payload(
        need,
        responder,
        body.assigned_by or org.get("name") or "EarthRelay Response Team",
        case.get("incident_type") or "",
    )
    updated = update_case(case_id, assignment=payload)
    if not updated:
        raise HTTPException(status_code=404, detail="Case not found")
    return updated


@app.get("/api/volunteers")
def volunteers_list(status: str | None = None):
    rows = load_volunteers()
    if status:
        rows = [row for row in rows if row.get("status") == status]
    return {
        "volunteers": [public_volunteer(row) for row in rows],
        "assignable": [public_volunteer(row) for row in assignable()],
        "needs": NEED_LABELS,
        "org": public_org(),
    }


@app.post("/api/volunteers")
def volunteers_join(body: VolunteerIn):
    try:
        row = create_volunteer(
            {
                "name": body.name,
                "email": body.email,
                "phone": body.phone,
                "organization": body.organization,
                "capabilities": body.capabilities,
                "status": "pending",
                "password": body.password,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return public_volunteer(row)


@app.post("/api/volunteers/invite")
def volunteers_invite(body: VolunteerIn):
    try:
        row = invite_volunteer(
            {
                "name": body.name,
                "email": body.email,
                "organization": body.organization,
                "access": body.access,
            }
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    join_url = (os.getenv("PUBLIC_APP_URL") or "https://localhost:5173").rstrip("/") + "/community"
    mail = send_invite(to_email=row["email"], role_label="Field Volunteer", join_url=join_url)
    row = {**public_volunteer(row), "email_sent": mail["sent"], "email_detail": mail["detail"]}
    return row


@app.post("/api/volunteers/session")
def volunteers_session(body: SessionIn):
    row, error = session_for_email(body.email, body.password, body.phone)
    if error or not row:
        raise HTTPException(status_code=401, detail=error or "Email or password is incorrect.")
    return public_volunteer(row)


@app.post("/api/volunteers/forgot")
def volunteers_forgot(body: VolunteerForgotIn):
    try:
        return start_volunteer_reset(body.email, body.phone)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/volunteers/reset")
def volunteers_reset(body: VolunteerResetIn):
    try:
        return complete_volunteer_reset(body.email, body.phone, body.code, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/volunteers/{volunteer_id}/password")
def volunteers_set_password(volunteer_id: str, body: VolunteerPasswordIn):
    try:
        return set_volunteer_password(volunteer_id, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/volunteers/{volunteer_id}/password/change")
def volunteers_change_password(volunteer_id: str, body: VolunteerChangePasswordIn):
    try:
        return change_volunteer_password(volunteer_id, body.current_password, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.patch("/api/volunteers/{volunteer_id}")
def volunteers_patch(volunteer_id: str, body: VolunteerIn):
    fields = {}
    if body.status:
        fields["status"] = body.status
    if body.name:
        fields["name"] = body.name
    if body.phone:
        fields["phone"] = body.phone
    if body.access is not None:
        fields["access"] = body.access
    if body.capabilities:
        fields["capabilities"] = body.capabilities
    row = update_volunteer(volunteer_id, fields)
    if not row:
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return public_volunteer(row)


@app.delete("/api/volunteers/{volunteer_id}")
def volunteers_delete(volunteer_id: str):
    if not delete_volunteer(volunteer_id):
        raise HTTPException(status_code=404, detail="Volunteer not found")
    return {"ok": True, "id": volunteer_id}


@app.get("/api/helpline")
def helpline_get():
    return helpline_directory()


@app.get("/api/eval/status")
def eval_status(rebuild: int = Query(0, ge=0, le=1)):
    """Gold-set catalog used for live reference matching (not training)."""
    try:
        from eval.catalog import catalog_summary, list_photo_entries, write_labels_csv
        from eval.reference import build_fingerprint_index, load_fingerprint_index

        rows = list_photo_entries()
        write_labels_csv(rows)
        if rebuild or not (Path(__file__).resolve().parent / "eval" / "fingerprints.json").exists():
            index = build_fingerprint_index(force=bool(rebuild))
        else:
            index = load_fingerprint_index()
        summary = catalog_summary(rows)
        last_run = {}
        last_path = Path(__file__).resolve().parent / "eval" / "last_run.json"
        if last_path.exists():
            try:
                last_run = json.loads(last_path.read_text(encoding="utf-8"))
            except json.JSONDecodeError:
                last_run = {}
        return {
            **summary,
            "fingerprints": index.get("count") or 0,
            "last_run_accuracy": last_run.get("accuracy"),
            "last_run_n": last_run.get("n"),
            "note": "Eval photos are a labeled gold set. Live uploads compare to them when Flash is weak or unclear — they do not train YOLO.",
        }
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/api/staff")
def staff_list():
    return {
        "staff": [public_staff(row) for row in load_staff()],
        "next_cms_id": next_cms_id(),
        "roles": ROLE_LABELS,
        "desks": DESK_LABELS,
    }


@app.post("/api/staff")
def staff_allot(body: StaffAllotIn):
    try:
        row = allot_staff(body.model_dump())
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return public_staff(row)


@app.post("/api/staff/session")
def staff_session(body: StaffSessionIn):
    row, error = session_for_cms(body.cms_id, body.password, body.phone)
    if error or not row:
        raise HTTPException(status_code=401, detail=error or "Staff ID or password is incorrect.")
    return public_staff(row)


@app.post("/api/staff/{cms_id}/password")
def staff_set_password(cms_id: str, body: StaffPasswordIn):
    try:
        row = set_staff_password(cms_id, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return public_staff(row)


@app.post("/api/staff/{cms_id}/password/change")
def staff_change_password(cms_id: str, body: StaffChangePasswordIn):
    try:
        row = change_staff_password(cms_id, body.current_password, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return public_staff(row)


@app.delete("/api/staff/{cms_id}")
def staff_delete(cms_id: str):
    if not delete_staff(cms_id):
        raise HTTPException(status_code=404, detail="Staff ID not found")
    return {"ok": True, "cms_id": cms_id}


@app.get("/api/org")
def org_get():
    return public_org()


@app.patch("/api/org")
def org_patch(body: OrgIn):
    return save_org({"name": body.name, "access_defaults": body.access_defaults})


@app.post("/api/org/setup")
def org_setup(body: OrgSetupIn):
    try:
        return setup_org_login(body.username, body.password, body.name, body.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/org/session")
def org_session(body: OrgSessionIn):
    row, error = session_for_org(body.username, body.password)
    if not row:
        raise HTTPException(status_code=401, detail=error or "Username or password is incorrect.")
    return row


@app.post("/api/org/forgot")
def org_forgot(body: OrgForgotIn):
    try:
        return start_org_reset(body.username, body.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/org/reset")
def org_reset(body: OrgResetIn):
    try:
        return complete_org_reset(body.username, body.email, body.code, body.password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/org/recovery")
def org_recovery(body: OrgRecoveryIn):
    try:
        return set_org_recovery_email(body.username, body.password, body.email)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.post("/api/org/password")
def org_password(body: OrgPasswordIn):
    try:
        return change_org_password(body.username, body.password, body.new_password)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/field/tasks")
def field_tasks(volunteer: str = Query(...)):
    return {"tasks": tasks_for(volunteer, list_cases())}


@app.get("/api/field/tasks/{case_id}")
def field_task(case_id: str, volunteer: str = Query(...)):
    task = task_for(volunteer, get_case(case_id))
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@app.post("/api/field/tasks/{case_id}/accept")
def field_accept(case_id: str, volunteer: str = Query(...)):
    case = get_case(case_id)
    assignment = (case or {}).get("assignment") or {}
    if not case or assignment.get("responder_id") != volunteer:
        raise HTTPException(status_code=404, detail="Task not found")
    updated = update_case(case_id, assignment_status="accepted")
    return task_for(volunteer, updated)


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
