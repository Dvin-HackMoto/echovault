# DB_PATH, PHOTO_DIR, OLLAMA_URL, LLM_MODEL, WHISPER_MODEL (.env)
import os
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parent.parent
ASSETS_DIR = BACKEND_DIR / "assets"

load_dotenv(BACKEND_DIR / ".env")


def _path(name: str, default: str) -> Path:
    # relative paths in .env are relative to backend/, wherever uvicorn is started from
    path = Path(os.getenv(name, default))
    return path if path.is_absolute() else BACKEND_DIR / path


def _flag(name: str) -> bool:
    return os.getenv(name, "false").strip().lower() in ("1", "true", "yes", "on")


DB_PATH = _path("DB_PATH", "storage/echovault.db")
PHOTO_DIR = _path("PHOTO_DIR", "storage/photos")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:3b")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")

# seed demo data on startup (see database/seed.py)
DEMO_MODE = _flag("DEMO_MODE")
