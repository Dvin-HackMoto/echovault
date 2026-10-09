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


def _seconds(name: str, default: float) -> float:
    try:
        return float(os.getenv(name, str(default)))
    except ValueError:
        return default


DB_PATH = _path("DB_PATH", "storage/echovault.db")
PHOTO_DIR = _path("PHOTO_DIR", "storage/photos")

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = os.getenv("LLM_MODEL", "qwen2.5:3b")
WHISPER_MODEL = os.getenv("WHISPER_MODEL", "small")
# how long one Ollama answer may take, and the first warm-up call (see ai/settings.py)
LLM_TIMEOUT_S = _seconds("LLM_TIMEOUT_S", 8.0)
LLM_WARMUP_TIMEOUT_S = _seconds("LLM_WARMUP_TIMEOUT_S", 60.0)

# seed demo data on startup (see database/seed.py)
DEMO_MODE = _flag("DEMO_MODE")
