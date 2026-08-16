import ee

ee.Initialize(project="earthrelay-ai")

print(ee.String("EarthRelay connected!").getInfo())