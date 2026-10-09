# Standalone hub for the Schedule module until HUB-3 fills in app/main.py.
# From backend/:  uvicorn app.features.schedule.dev_app:app --host 0.0.0.0 --port 8000
# Delete this file once main.py registers the schedule router.

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from .router import router

app = FastAPI(title="EchoVault hub (schedule only)")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)


@app.get("/health")
def health():
    return {"ok": True}
