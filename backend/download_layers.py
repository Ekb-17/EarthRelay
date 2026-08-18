"""Download EarthRelay map datasets: hazards, wildlife, protected areas."""

from __future__ import annotations

import asyncio
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
if str(ROOT) not in sys.path:
    sys.path.insert(0, str(ROOT))

from hazards import collection, fetch_earthquakes, fetch_floods, fetch_tsunamis
from layers import download_protected_areas, download_wildlife
from net import DATA_DIR, write_geojson


async def download_hazards() -> dict[str, int]:
    quakes, tsunamis, floods = await asyncio.gather(
        fetch_earthquakes(),
        fetch_tsunamis(),
        fetch_floods(),
        return_exceptions=True,
    )
    counts = {}
    for name, payload in (
        ("earthquakes.geojson", quakes),
        ("tsunamis.geojson", tsunamis),
        ("floods.geojson", floods),
    ):
        if isinstance(payload, Exception):
            print(f"  failed {name}: {payload}")
            counts[name] = 0
            continue
        write_geojson(name, collection(payload))
        counts[name] = len(payload)
        print(f"  saved {name}: {len(payload)} features")
    return counts


async def main() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    print("Downloading earthquake / tsunami / flood feeds...")
    await download_hazards()
    print("Downloading wildlife occurrences (GBIF)...")
    wildlife = await download_wildlife()
    print(f"  saved wildlife.geojson: {len(wildlife.get('features') or [])} features")
    print("Downloading protected areas...")
    protected = await download_protected_areas()
    print(f"  saved protected_areas.geojson: {len(protected.get('features') or [])} features")
    print(f"Done. Files are in {DATA_DIR}")


if __name__ == "__main__":
    asyncio.run(main())
