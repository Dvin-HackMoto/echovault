"""Integration: real Whisper transcription of team-recorded audio (Req 15.5, 11.2).

Run with ``pytest -m integration``. Tests skip with a clear message when a
recording is missing or the Whisper model cannot load.

Recordings live in ``backend/tests/fixtures/audio/``. The team should record
short (2-5 s), clear clips of exactly these phrases:

- ``en_clear.wav``  - English:  "Who is Ana?"
  -> transcript must contain ``EN_KEYWORDS`` (case-insensitive).
- ``fil_clear.wav`` - Filipino: "Sino si Ana?"
  -> transcript must contain ``FIL_KEYWORDS`` (case-insensitive).

Optional phone samples (recorded on the device with expo-av / the browser),
any speech, checked only for decoding through faster-whisper's bundled PyAV
without a system ffmpeg (Req 11.2):

- ``phone_sample.m4a``  (expo-av default)
- ``phone_sample.webm`` (web recorder)
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.ai import stt

AUDIO_DIR = Path(__file__).resolve().parent.parent / "fixtures" / "audio"

EN_KEYWORDS = ["ana"]
FIL_KEYWORDS = ["sino", "ana"]

PHONE_SAMPLES = ["phone_sample.m4a", "phone_sample.webm"]


def _require_recording(name: str) -> Path:
    path = AUDIO_DIR / name
    if not path.is_file():
        pytest.skip(
            f"Recording {name} not present yet in {AUDIO_DIR} "
            "(supplied by the team; see test_stt_audio.py docstring)"
        )
    return path


@pytest.mark.parametrize(
    ("filename", "keywords"),
    [("en_clear.wav", EN_KEYWORDS), ("fil_clear.wav", FIL_KEYWORDS)],
    ids=["en", "fil"],
)
def test_clear_recording_transcribes_keywords(request, filename, keywords):
    path = _require_recording(filename)
    request.getfixturevalue("whisper_ready")  # skips if the model can't load

    transcript = stt.transcribe(path)

    lowered = transcript.lower()
    missing = [word for word in keywords if word not in lowered]
    assert not missing, (
        f"{filename}: keywords {missing} not found in transcript {transcript!r}"
    )
    assert transcript == transcript.strip()


@pytest.mark.parametrize("filename", PHONE_SAMPLES)
def test_phone_sample_decodes(filename):
    path = _require_recording(filename)
    pytest.importorskip(
        "faster_whisper", reason="faster-whisper not installed; cannot decode audio"
    )

    audio = stt._decode(path)

    assert getattr(audio, "size", 0) > 0, f"{filename} decoded to empty audio"
