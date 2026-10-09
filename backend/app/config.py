"""Runtime configuration for the EchoVault hub.

Reads a small set of environment variables (optionally from a .env file) and
exposes them as module-level constants. Defaults match backend/.env.example so
the app runs with no .env present.
"""

import os

from dotenv import load_dotenv

# Tolerate a missing .env — load_dotenv is a no-op if the file is absent.
load_dotenv()

DB_PATH = os.environ.get("DB_PATH", "storage/echovault.db")
PHOTO_DIR = os.environ.get("PHOTO_DIR", "storage/photos")
OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
LLM_MODEL = os.environ.get("LLM_MODEL", "qwen2.5:3b")
WHISPER_MODEL = os.environ.get("WHISPER_MODEL", "small")
