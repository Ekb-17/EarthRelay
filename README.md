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

| Who | What they do | Live link |
|---|---|---|
| **Citizen** | Report with photo + live GPS; get a case alert | [https://earthrelay-production.up.railway.app/](https://earthrelay-production.up.railway.app/) |
| **Organization** | Inbox, assign response, invite volunteers, staff IDs, settings | [https://earthrelay-production.up.railway.app/app/signin](https://earthrelay-production.up.railway.app/app/signin) |
| **Staff** | Desk work with Staff ID | [https://earthrelay-production.up.railway.app/staff/signin](https://earthrelay-production.up.railway.app/staff/signin) |
| **Volunteer** | Join / sign in; accept field tasks (map pin + street address, not citizen phone/name) | [https://earthrelay-production.up.railway.app/community](https://earthrelay-production.up.railway.app/community) |

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

Deploy on **Railway** from this GitHub repo. Official demo entry points:

| Role | Live link |
|---|---|
| Citizen | [https://earthrelay-production.up.railway.app/](https://earthrelay-production.up.railway.app/) |
| Volunteer | [https://earthrelay-production.up.railway.app/community](https://earthrelay-production.up.railway.app/community) |
| Organization | [https://earthrelay-production.up.railway.app/app/signin](https://earthrelay-production.up.railway.app/app/signin) |
| Staff | [https://earthrelay-production.up.railway.app/staff/signin](https://earthrelay-production.up.railway.app/staff/signin) |

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
| Working demo | Live app: https://earthrelay-production.up.railway.app — and a screen recording (provided with this submission) |
| Public source repo | This GitHub repository |
| Written description | This README |
| Attribution | [ATTRIBUTION.md](ATTRIBUTION.md) |

## Frameworks

Application structure and libraries the product is built on:

| Framework | Role |
|---|---|
| FastAPI | Backend HTTP API and service layer |
| React | Citizen, organization, staff, and volunteer interfaces |
| React Router | Client-side navigation across roles and case flows |
| Ultralytics YOLO | On-device / CPU object detection for field photos |
| Mapbox GL JS | Interactive map rendering and layer controls |

## Technologies

Languages, platforms, and technical capabilities used in the system:

| Technology | Role |
|---|---|
| Python | Backend services, detection pipeline, case logic |
| JavaScript (ES modules) | Frontend application code |
| CSS | Interface layout and styling |
| Docker | Production container image for API + built UI |
| REST APIs | Client–server communication |
| Computer vision / AI | YOLO detections; Google Gemini for scene and severity support when configured |
| GPS / browser geolocation | Live incident pinning for citizens and field context |
| GeoJSON map layers | Hazards, wildlife, and protected-area context on the workspace map |
| JSON case store | Local case persistence (`backend/data/cases/`), with optional cloud sync when configured |

## Tools

Build, run, host, and operate the project:

| Tool | Role |
|---|---|
| Vite | Frontend bundling and local development server |
| Uvicorn | ASGI server for the FastAPI app |
| npm | Frontend dependency management |
| pip / Python venv | Backend dependency management |
| GitHub | Source control and collaboration |
| Railway | Hosted production deployment and public demo URL |
| OpenFreeMap | Default street basemap when no Mapbox token is set |
| Open-Meteo | Weather and air-quality context |
| USGS / NOAA / NASA EONET + GDACS | Earthquake, tsunami, and flood hazard feeds |
| Komoot Photon + OpenStreetMap Nominatim | Place search and reverse geocoding |
| GBIF, Natural Earth, UNESCO caches | Wildlife and protected-area reference layers |
| NASA GIBS | Optional satellite imagery overlay |
| SMTP (e.g. Gmail app password) | Optional email for invites and password-reset codes |
| Google Gemini API | Optional higher-quality scene / severity assistance |
| Mapbox account / token | Optional Mapbox streets and satellite styles |

Secrets stay in local `.env` or Railway Variables — never in the repository. See [ATTRIBUTION.md](ATTRIBUTION.md) for third-party terms.

## License

MIT. Third-party terms still apply to the datasets and APIs listed in [ATTRIBUTION.md](ATTRIBUTION.md).
