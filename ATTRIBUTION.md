# Attribution

EarthRelay uses the following third-party datasets, libraries, and APIs. Include this file with hackathon submissions.

## Libraries

| Project | Use | License (typical) |
|---|---|---|
| [FastAPI](https://fastapi.tiangolo.com/) | HTTP API | MIT |
| [Uvicorn](https://www.uvicorn.org/) | ASGI server | BSD |
| [Ultralytics YOLO](https://github.com/ultralytics/ultralytics) | CPU object detection | AGPL-3.0 (Ultralytics) |
| [Pillow](https://python-pillow.org/) | Image I/O | HPND |
| [React](https://react.dev/) | UI | MIT |
| [Vite](https://vite.dev/) | Frontend tooling | MIT |
| [Mapbox GL JS](https://github.com/mapbox/mapbox-gl-js) | Map renderer | See Mapbox GL JS license |
| [Lucide](https://lucide.dev/) | Icons | ISC |
| [React Router](https://reactrouter.com/) | Routes | MIT |

YOLO11n weights are downloaded by Ultralytics at runtime (or baked in the Docker image). They are not redistributed in this git repository.

## Datasets and live APIs

| Source | What EarthRelay uses |
|---|---|
| [USGS earthquake feed](https://earthquake.usgs.gov/) | Recent M4.5+ earthquakes (GeoJSON) |
| [NOAA NCEI](https://www.ngdc.noaa.gov/) | Historical tsunami events |
| [NASA EONET](https://eonet.gsfc.nasa.gov/) | Flood events |
| [GDACS](https://www.gdacs.org/) | Flood / disaster alerts |
| [NASA GIBS](https://earthdata.nasa.gov/eosdis/science-system-description/eosdis-components/gibs) | Satellite imagery tiles |
| [Open-Meteo](https://open-meteo.com/) | Weather and air quality (no key required for non-commercial use) |
| [GBIF](https://www.gbif.org/) | Threatened / wildlife occurrence points |
| [Natural Earth](https://www.naturalearthdata.com/) | Protected / geographic context |
| [UNESCO](https://whc.unesco.org/) | World Heritage / protected area context (via layer pipeline) |
| [Komoot Photon](https://photon.komoot.io/) | Place search and reverse geocoding |
| [OpenStreetMap Nominatim](https://nominatim.org/) | Place search / reverse geocode fallback |
| [OpenFreeMap](https://openfreemap.org/) | Street map style when no Mapbox token is set |
| [Mapbox](https://www.mapbox.org/) | Optional streets style if `VITE_MAPBOX_TOKEN` is set |
| [Google Earth Engine](https://earthengine.google.com/) | Optional, noncommercial only — not required to run the demo |

Cached copies of public GeoJSON layers may live under `backend/data/*.geojson`. Refresh with `python backend/download_layers.py`. Respect each provider’s terms and rate limits.
