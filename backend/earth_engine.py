"""Optional Earth Engine smoke test. Not used by the map, GPS, or case inbox.

The live app draws streets from OpenFreeMap, satellite from NASA GIBS, and
the pin from the browser GPS. This script only checks that a GEE project
exists. Do not import it from main.py — GEE calls can hit Google Cloud billing.
"""

import ee

ee.Initialize(project="earthrelay-ai")

print(ee.String("EarthRelay connected!").getInfo())
