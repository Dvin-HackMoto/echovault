"""STT_Service: local speech-to-text with faster-whisper.

The Whisper model is loaded at most once per process, lazily and thread-safely
(Req 10). ``faster_whisper`` is imported only inside ``_create_model`` so this
module imports cleanly before the package or model files are available.
"""

from __future__ import annotations

import logging
import os
import threading
from typing import Any

from . import settings

logger = logging.getLogger(__name__)

ALLOWED_LANGUAGES = ("en", "tl")


class STTError(Exception):
    """Base class for known speech-to-text errors."""


class STTLoadError(STTError):
    """The Whisper model failed to load."""


class AudioUnreadable(STTError):
    """The audio file is missing or cannot be decoded."""


_model: Any = None
_lock = threading.Lock()


def _create_model(name: str) -> Any:
    """Build the Whisper model. Seam patched by tests."""
    from faster_whisper import WhisperModel

    return WhisperModel(name, device="cpu", compute_type="int8")


def load_model() -> Any:
    """Return the shared Whisper model, loading it on first use.

    Idempotent and thread-safe (double-checked lock). On failure raises
    ``STTLoadError`` chained to the cause and leaves the model unset, so a
    later call retries the load.
    """
    global _model
    if _model is not None:
        return _model
    with _lock:
        if _model is None:
            name = settings.whisper_model()
            try:
                model = _create_model(name)
            except Exception as exc:
                raise STTLoadError(
                    f"Could not load Whisper model '{name}': {exc}"
                ) from exc
            _model = model
            logger.info("Whisper model '%s' loaded", name)
    return _model


def _decode(path: str | os.PathLike) -> Any:
    """Decode an audio file to a 16 kHz mono float array. Seam patched by tests.

    Uses faster-whisper's PyAV decoder (handles wav/m4a/webm). Any failure is
    raised as ``AudioUnreadable`` with the path and cause.
    """
    try:
        from faster_whisper import decode_audio

        return decode_audio(str(path), sampling_rate=16000)
    except Exception as exc:
        raise AudioUnreadable(f"Cannot decode audio {path}: {exc}") from exc


def _choose_language(probs: Any) -> str:
    """Pick ``en`` or ``tl`` from ``(code, prob)`` pairs, whichever is higher.

    Defaults to ``en`` when neither is present, on ties, or when ``probs`` is
    ``None`` / malformed (Req 11.3, 11.4).
    """
    best = {"en": 0.0, "tl": 0.0}
    seen = False
    try:
        for item in probs or ():
            try:
                code, prob = item
                prob = float(prob)
            except (TypeError, ValueError):
                continue
            if code in best and prob == prob:  # skip NaN
                best[code] = max(best[code], prob)
                seen = True
    except TypeError:
        return "en"
    if not seen:
        return "en"
    return "tl" if best["tl"] > best["en"] else "en"


def transcribe(path: str | os.PathLike) -> str:
    """Transcribe an audio file to text in English or Filipino.

    Raises ``STTLoadError`` if the model cannot load and ``AudioUnreadable`` if
    the file is missing or undecodable. Returns ``""`` for zero-length audio or
    when no speech is found (Req 11).
    """
    model = load_model()

    try:
        is_file = os.path.isfile(path)
    except (TypeError, ValueError):
        is_file = False
    if not is_file:
        raise AudioUnreadable(f"Audio file not found: {path}")

    audio = _decode(path)
    if getattr(audio, "size", 0) == 0:
        return ""

    try:
        _, _, probs = model.detect_language(audio=audio, vad_filter=True)
        lang = _choose_language(probs)
    except Exception as exc:  # e.g. VAD removed all speech
        logger.debug("Language detection failed, defaulting to en: %s", exc)
        lang = "en"

    segments, _ = model.transcribe(
        audio, language=lang, vad_filter=True, beam_size=5
    )
    parts = [text for text in (seg.text.strip() for seg in segments) if text]
    return " ".join(parts).strip()


def warm_up() -> bool:
    """Run the loaded model once on 1 s of silence so the first real request is fast.

    The first inference initialises CTranslate2 and the VAD model (~10 s on a
    laptop CPU); doing it at startup keeps the first voice question at a few
    seconds. Returns ``False`` (and logs) on any failure; never raises.
    """
    try:
        import numpy as np

        model = load_model()
        silence = np.zeros(16000, dtype=np.float32)
        segments, _ = model.transcribe(silence, language="en", vad_filter=False, beam_size=1)
        for _ in segments:  # transcription is lazy until iterated
            pass
        return True
    except Exception as exc:
        logger.warning("Whisper warm-up failed: %s", exc)
        return False


def _reset_for_tests() -> None:
    """Drop the cached model so each test starts unloaded."""
    global _model
    with _lock:
        _model = None
