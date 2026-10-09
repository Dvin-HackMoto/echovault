# Run the Medications endpoints on their own, with demo data, for manual testing.
# From backend/:  py -m uvicorn app.features.medications.dev_app:app --host 0.0.0.0 --port 8000
#
# With the real hub modules present (main), this uses the real database file: on
# startup it applies schema.sql and runs the hub's own seed.seed(conn), both of which
# are idempotent. Caregiver headers: X-Role: caregiver, X-Caregiver-Id: <a seeded
# caregiver id> (caregiver-demo-1 on main). Without the hub modules it falls back to
# mock.py's database, where the caregiver id is mock-cg-ana.

import importlib
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import deps
from .router import router

SCHEMA_PATH = Path(__file__).resolve().parents[2] / "database" / "schema.sql"


def prepare_database():
    if deps.get_db.__module__.endswith("medications.mock"):
        return  # the mock creates and fills its own database
    db = deps.get_db()
    conn = next(db)
    try:
        conn.executescript(SCHEMA_PATH.read_text(encoding="utf-8"))
        seed = getattr(importlib.import_module("app.database.seed"), "seed", None)
        if seed is not None:
            seed(conn)
        conn.commit()
    finally:
        db.close()


@asynccontextmanager
async def lifespan(app):
    prepare_database()
    yield


app = FastAPI(title="EchoVault hub (medications only)", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
app.include_router(router)
app.mount("/photos", StaticFiles(directory=deps.photo_dir(), check_dir=False), name="photos")


@app.get("/health")
def health():
    return {"status": "ok"}
