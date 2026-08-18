# EarthRelay frontend

React UI for filing cases, the hazard map, GPS, and the NGO inbox.

## Run

```bash
npm install
npm run dev
```

Vite listens on port **5173** and proxies `/api` and `/uploads` to the backend on port **8000**.

Production build (also used by the Docker image):

```bash
npm run build
```

## Layout

| File | Role |
|---|---|
| `src/App.jsx` | Routes |
| `src/pages.jsx` | Landing, role pick, case details, contact |
| `src/Workspace.jsx` | File-a-report (citizen) and NGO inbox |
| `src/CaseReport.jsx` | Full case packet + take / call / dispatch |
| `src/HazardMap.jsx` | Mapbox GL map + layers |
| `src/LocationPrompt.jsx` | Location on / off / not-working prompt |
| `src/routing.js` | Client copy of auto-forward rules |
| `src/gps.js` | Geolocation status helpers |

## Map

Without `VITE_MAPBOX_TOKEN`, streets come from OpenFreeMap. Set the token in the **repo-root** `.env` (Vite `envDir` is the parent folder).
