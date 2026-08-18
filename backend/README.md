# EarthRelay backend

FastAPI service for case intake, CPU detection, map layers, and the NGO inbox.

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
| `cases.py` | Local JSON case store |
| `routing.py` | Auto-forward to fire / org / water / wildlife desks |
| `report.py` | Severity, narrative, weather notes |
| `places.py` | Place search + reverse geocode (street address) |
| `hazards.py` | Earthquakes, tsunamis, floods |
| `layers.py` | Weather, AQI, satellite, wildlife, protected areas |
| `download_layers.py` | Refresh cached GeoJSON under `data/` |
| `earth_engine.py` | Optional Earth Engine smoke test (not required) |

## Data directory

```
backend/data/
  cases/       submitted cases (gitignored)
  uploads/     original + annotated photos (gitignored)
  *.geojson    cached public map layers (committed; refresh with download_layers.py)
```

Refresh layers:

```bash
python backend/download_layers.py
```

## Detection

Uses Ultralytics YOLO11n on CPU. Place `yolo11n.pt` at the repo root, or let Ultralytics download it on first run. Weights are gitignored.

## Environment

Copy `.env.example` to `.env` at the repo root. Nothing is required for a working demo. `VITE_MAPBOX_TOKEN` is only read by the frontend build.
