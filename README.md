# EarthRelay

Environmental case intelligence for **detection, investigation, and response**.

EarthRelay turns a field photo + GPS into a structured case, then moves that case through the people who act on it: **citizens**, **organization desks**, **staff**, and **volunteers**.

Live demo (Railway): [https://earthrelay-production.up.railway.app](https://earthrelay-production.up.railway.app)

Source: this GitHub repository.

## Problem

Environmental harm is usually spotted by people on the ground — dumping, smoke, flood water, damaged habitat, injured wildlife — but the path from “I saw this” to “someone is handling it” is broken.

Today, reports often live in informal chats or one-off messages: a photo without a reliable pin, no shared severity, no clear owner, and no handoff to field help. Organizations cannot triage quickly. Volunteers do not get a safe, limited view of what to do on site. Staff have no single desk to work from.

EarthRelay closes that gap: one case file that links **detection** (what the photo shows), **investigation** (severity, place, weather, write-up), and **response** (routing, assignment, volunteer field tasks, follow-up).

## What it does

### Four roles, one app

| Who | What they do | Entry |
|---|---|---|
| **Citizen** | Report with photo + live GPS; get a case alert | `/` → Get started |
| **Organization** | Inbox, assign response, invite volunteers, staff IDs, settings | `/app/signin` |
| **Staff** | Desk work with Staff ID | `/staff/signin` |
| **Volunteer** | Join / sign in; accept field tasks (map pin + street address, not citizen phone/name) | `/community` |

On a **fresh deploy**, the organization desk opens with **Create organization login** (username, password, recovery email). Operators set their own credentials; secrets are not stored in this repository.

### Case flow

1. Citizen uploads a site photo, confirms GPS, and may add a phone for critical callbacks.
2. The backend runs vision + investigation logic (YOLO on CPU, Gemini when configured for scene/severity), reverse-geocodes the pin, and attaches weather / context when available.
3. The case is **auto-routed** to a response team / NGO inbox family (for example fire, water, wildlife, organization).
4. Org officers **take** the case, update status, assign response needs, and dispatch using phone + map when appropriate.
5. Volunteers see only assigned **field tasks** (pin, area, street address, task copy) — not the citizen’s private contact details unless the org grants that access.

### Map and context layers

The workspace map can show EarthRelay cases plus public hazard layers (for example USGS earthquakes, floods, wildlife / protected-area context) and optional satellite overlay. Without a Mapbox token, streets use OpenFreeMap.

## Demo (local)

You need **two terminals**.

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

Open [http://localhost:5173/](http://localhost:5173/). Localhost is a secure context, so browser GPS can work.

Copy `.env.example` to `.env` for optional keys (SMTP, Mapbox, Gemini, etc.). Do not commit `.env`.

### Phone GPS

Browsers block geolocation on plain `http://192.168…` addresses. Prefer:

- Laptop **localhost**, or  
- The **https** Railway URL  

Citizen phone and org laptop should use the **same** EarthRelay host so filings land in one inbox.

## Production / hackathon live link

One Docker image serves the API and the built React app (`Dockerfile` + `railway.toml`).

```bash
docker build -t earthrelay .
docker run -p 8000:8000 earthrelay
```

Deploy on **Railway** from this GitHub repo. Official demo:

**https://earthrelay-production.up.railway.app**

| Role | Path |
|---|---|
| Citizen | `/` |
| Volunteer | `/community` |
| Organization | `/app/signin` |
| Staff | `/staff/signin` |

Optional env vars (Railway Variables): SMTP for invite/reset email, `VITE_MAPBOX_TOKEN`, Gemini keys, etc. Without Mapbox, OpenFreeMap is used.

## Project structure

```
backend/          FastAPI: cases, report/AI, volunteers, staff, field tasks, hazards, mail
frontend/         React (Vite) UI for all roles
Dockerfile        Production image (frontend build + API)
railway.toml      Railway deploy config
ATTRIBUTION.md    Third-party data, libraries, and APIs
```

See [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Hackathon submission

| Requirement | Where it is |
|---|---|
| Working demo | https://earthrelay-production.up.railway.app (or a screen recording) |
| Public source repo | This GitHub repository |
| Written description | This README |
| Attribution | [ATTRIBUTION.md](ATTRIBUTION.md) |

## Tech stack

| Layer | Choice |
|---|---|
| API | FastAPI, Uvicorn |
| Detection / vision | Ultralytics YOLO11n on CPU; Google Gemini (when configured) for scene / severity |
| Cases | Local JSON store (`backend/data/cases/`); optional cloud sync when configured |
| Auth desks | Organization, staff, and volunteer sessions (passwords hashed; org setup on first visit) |
| Frontend | React, Vite, React Router, Mapbox GL |
| Map (no token) | OpenFreeMap liberty style |
| Weather / AQI | Open-Meteo |
| Hazards | USGS earthquakes, NOAA NCEI tsunamis, NASA EONET + GDACS floods |
| Satellite tiles | NASA GIBS |
| Places / address | Komoot Photon, OpenStreetMap Nominatim |
| Wildlife / protected | GBIF, Natural Earth / UNESCO (cached GeoJSON) |
| Email (optional) | SMTP for invites and password-reset codes |

## License

MIT. Third-party terms still apply to the datasets and APIs listed in [ATTRIBUTION.md](ATTRIBUTION.md).
