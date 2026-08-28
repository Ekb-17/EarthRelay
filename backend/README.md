# EarthRelay backend

FastAPI service for case intake, vision/investigation, map layers, and desks for **organization**, **staff**, and **volunteers**.

## Run

From the repo root, with the virtualenv active:

```bash
pip install -r backend/requirements.txt
python -m uvicorn main:app --reload --app-dir backend --port 8000
```

- API: [http://127.0.0.1:8000/api](http://127.0.0.1:8000/api)
- Health: [http://127.0.0.1:8000/health](http://127.0.0.1:8000/health)

If `frontend/dist` exists, the same process also serves the web app at `/`.

## Layout

| File | Role |
|---|---|
| `main.py` | HTTP routes, uploads, SPA fallback |
| `detect.py` | YOLO CPU detection + annotated JPEG |
| `report.py` | Severity, narrative, Gemini scene help when configured |
| `cases.py` | Local JSON case store |
| `routing.py` | Auto-forward to response desks |
| `volunteers.py` | Volunteer join / sign-in / org setup + recovery |
| `staff.py` | Staff IDs and sessions |
| `field.py` | Volunteer field-task copy and access |
| `mail.py` | Optional SMTP invites / reset codes |
| `places.py` | Place search + reverse geocode (street address) |
| `hazards.py` | Earthquakes, tsunamis, floods |
| `layers.py` | Weather, AQI, satellite, wildlife, protected areas |
| `phone.py` | Phone notice helpers |
| `cloud.py` | Optional cloud case sync when configured |

## Data directory

```
backend/data/
  cases/           submitted cases (gitignored)
  uploads/         original + annotated photos (gitignored)
  org.json         organization login (gitignored — created on first setup)
  volunteers.json  volunteer records (local)
  staff.json       staff IDs (local)
  *.geojson        cached public map layers
```

## Detection

Uses Ultralytics YOLO11n on CPU. Optional Google Gemini improves scene / severity when API keys are set. Weights and secrets are not committed.

## Environment

Copy `.env.example` to `.env` at the repo root. Nothing is required for a basic demo. Optional: SMTP, Mapbox (`VITE_MAPBOX_TOKEN` for frontend build), Gemini keys.
