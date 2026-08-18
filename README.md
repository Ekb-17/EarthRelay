# EarthRelay

AI environmental case intelligence for **detection, investigation, and response**.

A citizen files a field photo. EarthRelay detects what is in the image, builds a full case report (severity, weather, location, AI write-up), **auto-forwards** it to the right desk, and lets an NGO **take the case, call, and dispatch**.

This is the **official EarthRelay app**. Everyone — phone, laptop, judges — should use the same live URL so cases land in one inbox.

## Problem

Environmental incidents (dumping, fire, flooding, injured wildlife) are reported as photos in chats, with no shared location, no severity, and no owner. Response teams cannot see a structured case or reach the reporter.

## What it does

1. **Citizen** uploads a site photo, pins GPS, and can add a phone number.
2. **CPU object detection** (YOLO) plus an investigation write-up (severity, causes, actions, weather).
3. **Auto-route** to a desk:
   - Fire, smoke, burning trash, earthquake → **Fire team**
   - Dumping / garbage / debris → **EarthRelay organization**
   - Flood / sewage / water → **Water unit**
   - Wildlife → **Wildlife unit**
4. **NGO inbox** receives the full packet: original + annotated photos, title, notes, incident type, GPS + street address, phone, severity/priority, AI write-up, weather, map pin.
5. Officers **take the case**, set status (investigating / cleanup / resolved), and **call or dispatch** using phone + GPS.

Phone numbers are stored for dispatch. The reporter is told: *For critical or important info, the organization may call you.*

## Demo (local)

You need **two terminals** on the laptop.

**Backend**

```bash
python -m venv venv
venv\Scripts\activate
pip install -r backend/requirements.txt
python -m uvicorn main:app --reload --app-dir backend --port 8000
```

**Frontend** (from `frontend/`; on Windows PowerShell use `npm.cmd` if `npm` is blocked)

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:5173/](http://localhost:5173/). Localhost is a secure context, so GPS can work in the browser.

First detection downloads `yolo11n.pt` automatically if no local model is present.

### Phone GPS

Browsers block geolocation on plain `http://192.168…` addresses. For a phone:

- Use **localhost on the laptop**, or
- Put the app on **https** (Cloudflare quick tunnel to the Vite port, or the Railway live URL).

Citizen on the phone and NGO on the laptop must use **the same EarthRelay** (same server). Then a filing appears in the NGO inbox within a few seconds.

## Production / hackathon live link

One Docker image serves the API and the built React app.

```bash
docker build -t earthrelay .
docker run -p 8000:8000 earthrelay
```

Deploy on **Railway** from this GitHub repo (`Dockerfile` + `railway.toml`). The Railway URL is the official demo link for judges.

Optional: set `VITE_MAPBOX_TOKEN` for Mapbox streets. Without it, the map uses OpenFreeMap (no token required).

## Project structure

```
backend/          FastAPI API, detection, cases, map layers
frontend/         React (Vite) UI
Dockerfile        Production image (frontend build + API)
railway.toml      Railway deploy config
ATTRIBUTION.md    Third-party data, libraries, and APIs
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Hackathon submission

| Requirement | Where it is |
|---|---|
| Working demo | Railway live URL (see Production below) or a screen recording of localhost |
| Public source repo | This GitHub repository |
| Written description | This README (problem, implementation, tech) |
| Attribution | [ATTRIBUTION.md](ATTRIBUTION.md) |

## Tech stack

| Layer | Choice |
|---|---|
| API | FastAPI, Uvicorn |
| Detection | Ultralytics YOLO11n on CPU |
| Cases | Local JSON store (`backend/data/cases/`) |
| Frontend | React, Vite, React Router, Mapbox GL |
| Map (no token) | OpenFreeMap liberty style |
| Weather / AQI | Open-Meteo |
| Hazards | USGS earthquakes, NOAA NCEI tsunamis, NASA EONET + GDACS floods |
| Satellite tiles | NASA GIBS |
| Places / address | Komoot Photon, OpenStreetMap Nominatim |
| Wildlife / protected | GBIF, Natural Earth / UNESCO (cached GeoJSON) |

Earth Engine is **optional and noncommercial**. The product does not require it.

## License

MIT. Third-party terms still apply to the datasets and APIs listed in [ATTRIBUTION.md](ATTRIBUTION.md).
