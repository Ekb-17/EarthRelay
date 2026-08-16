from fastapi import FastAPI

app = FastAPI(title="EarthRelay API")


@app.get("/")
def root():
    return {
        "project": "EarthRelay",
        "status": "online"
    }


@app.get("/health")
def health():
    return {"status": "healthy"}