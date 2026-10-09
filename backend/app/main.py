"""EchoVault hub FastAPI application (minimal).

Runs the idempotent migration on startup and registers the Module 11 routers
(settings and dashboard). No Ollama/Whisper/static-photo wiring here — that is
added by other modules.
"""

from fastapi import FastAPI

from app import config
from app.database import connection
from app.features.backup.router import router as backup_router
from app.features.dashboard.router import router as dashboard_router
from app.features.memories import service as memories_service
from app.features.memories.router import router as memories_router
from app.features.people.places_router import router as places_router
from app.features.people.router import router as people_router
from app.features.settings.router import router as settings_router

app = FastAPI(title="EchoVault Hub")


@app.on_event("startup")
def _startup():
    conn = connection.connect(config.DB_PATH)
    try:
        connection.migrate(conn)
        # MEM-3: sweep expired memories once at startup (guarded once-per-day).
        memories_service.run_daily_expiry(conn)
    finally:
        conn.close()


app.include_router(settings_router)
app.include_router(dashboard_router)
app.include_router(backup_router)
app.include_router(people_router)
app.include_router(places_router)
app.include_router(memories_router)
