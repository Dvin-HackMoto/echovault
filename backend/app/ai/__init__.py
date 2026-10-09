"""AI services: local LLM (Ollama), speech-to-text (faster-whisper), prompts and fallback.

``app/main.py`` calls ``from app.ai import startup; startup()`` once at boot.
Importing this package does not import faster_whisper; the model loads lazily.
"""

from __future__ import annotations

import logging

from . import llm, settings, stt
from .fallback import build_fallback_answer, no_data_reply
from .llm import LLMUnavailable, complete, warm_up
from .prompts import build_prompt, build_system_prompt
from .stt import AudioUnreadable, STTLoadError, transcribe

__all__ = [
    "LLMUnavailable",
    "complete",
    "warm_up",
    "AudioUnreadable",
    "STTLoadError",
    "transcribe",
    "build_prompt",
    "build_system_prompt",
    "build_fallback_answer",
    "no_data_reply",
    "startup",
]

log = logging.getLogger(__name__)


def startup() -> None:
    """Load Whisper and warm up Ollama. Logs warnings on failure, never raises."""
    # Module attribute lookups (stt.load_model, llm.warm_up) so tests can patch them.
    try:
        stt.load_model()
        log.info("Whisper model %s loaded", settings.whisper_model())
    except Exception as exc:
        log.warning("Whisper model not loaded, voice will retry on first use: %s", exc)
    else:
        stt.warm_up()  # never raises; keeps the first voice question fast
    try:
        llm.warm_up()  # already never raises; guard kept for safety
    except Exception as exc:
        log.warning("Ollama warm-up failed: %s", exc)
