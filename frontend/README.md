# EarthRelay frontend

React UI for citizens, organization desks, staff, and volunteers.

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

## Main routes

| Path | Role |
|---|---|
| `/` | Citizen landing |
| `/who` → `/confirm` | Citizen report flow |
| `/community` | Volunteer landing / join / sign-in / tasks |
| `/app/signin` | Organization setup or sign-in |
| `/app` | Organization cases inbox + map |
| `/staff/signin` | Staff ID sign-in |

## Layout

| File | Role |
|---|---|
| `src/App.jsx` | Routes |
| `src/pages.jsx` | Landing, help/about, case contact screens |
| `src/WhoYouAre.jsx` | Citizen report form + GPS gate |
| `src/FlowPages.jsx` | Safety, confirm, dispatch brief, activity |
| `src/Workspace.jsx` | Organization cases inbox + hazard map |
| `src/Community.jsx` | Volunteer community and field tasks |
| `src/OrgAuth.jsx` | Organization create-login / sign-in / reset |
| `src/OrgPages.jsx` / `OrgShell.jsx` | Org settings, invites, staff IDs, etc. |
| `src/Staff.jsx` | Staff desk |
| `src/CaseReport.jsx` | Case packet UI |
| `src/HazardMap.jsx` | Mapbox GL map + layers |
| `src/LocationPrompt.jsx` | Location allow / deny / retry |
| `src/routing.js` | Client routing / status labels |
| `src/gps.js` | Geolocation helpers |

## Map

Without `VITE_MAPBOX_TOKEN`, streets come from OpenFreeMap. Set optional tokens in the **repo-root** `.env` (Vite `envDir` is the parent folder). Never commit secrets.
