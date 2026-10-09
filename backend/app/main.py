# FastAPI app, CORS, registers routers, runs migrate() on startup
import importlib
import socket
import sys
from collections.abc import Callable
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import APIRouter, Depends, FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from app import config
from app.database.connection import migrate
from app.database.seed import seed
from app.features.trivia.loader import load_preloaded as load_trivia
from app.middleware.dependencies import enforce_access_level

FEATURES_DIR = Path(__file__).parent / "features"


def lan_ip() -> str:
    # a UDP "connect" sends nothing; it only asks the OS which interface it would use
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_DGRAM) as sock:
            sock.connect(("10.255.255.255", 1))
            return sock.getsockname()[0]
    except OSError:
        pass
    try:
        return socket.gethostbyname(socket.gethostname())
    except OSError:
        return "127.0.0.1"


def register_feature_routers(
    app: FastAPI, features_dir: Path = FEATURES_DIR, package: str = "app.features"
) -> list[str]:
    # every features/<name>/router.py that defines `router = APIRouter(...)` is included;
    # placeholder files without one are skipped, import errors are not swallowed
    registered = []
    for folder in sorted(p for p in features_dir.iterdir() if (p / "router.py").is_file()):
        module = importlib.import_module(f"{package}.{folder.name}.router")
        router = getattr(module, "router", None)
        if isinstance(router, APIRouter):
            app.include_router(router)
            registered.append(folder.name)
    return registered


def _startup_step(name: str, action: Callable[[], object]) -> None:
    # names the failed step on stderr, then re-raises so uvicorn aborts startup
    try:
        action()
    except Exception as error:
        print(f"EchoVault hub failed to start: {name}: {error}", file=sys.stderr)
        raise


@asynccontextmanager
async def lifespan(app: FastAPI):
    # migrate and seed are looked up at call time, so tests can patch app.main.migrate/seed
    _startup_step("create storage folders", lambda: config.PHOTO_DIR.mkdir(parents=True, exist_ok=True))
    _startup_step("migrate database", migrate)
    # TRV-1: general trivia comes from assets/trivia.json on every start, demo mode or not
    _startup_step("load preloaded trivia", load_trivia)
    if config.DEMO_MODE:
        _startup_step("seed demo data", seed)
    print(f"EchoVault hub ready. Phones connect to: http://{lan_ip()}:8000 (uvicorn's default port)")
    yield


def create_app() -> FastAPI:
    # enforce_access_level runs before every route: viewers are read-only, only admins delete
    app = FastAPI(title="EchoVault Hub", lifespan=lifespan, dependencies=[Depends(enforce_access_level)])
    app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

    @app.get("/health")
    def health() -> dict:
        return {"status": "ok"}

    register_feature_routers(app)
    # photo_path in the DB is a file name inside PHOTO_DIR; its URL is /photos/<photo_path>
    app.mount("/photos", StaticFiles(directory=config.PHOTO_DIR, check_dir=False), name="photos")
    return app


app = create_app()
