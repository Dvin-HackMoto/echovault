"""Unit tests for app.ai.stt (Requirements 10, 11, 13.3).

No real Whisper model or audio decoder is used: ``stt._create_model`` is
patched with a counting factory returning ``FakeWhisperModel`` and
``stt._decode`` with a fake audio array (NumPy is not a dependency).
"""

from __future__ import annotations

import sys
import threading
import time
import types
from dataclasses import dataclass

import pytest

from app.ai import stt


@dataclass
class FakeSegment:
    text: str


class FakeAudio:
    """Minimal stand-in for a NumPy float array: only ``.size`` is read."""

    def __init__(self, size: int) -> None:
        self.size = size


class FakeWhisperModel:
    def __init__(self, probs=None, segments=(), detect_error=None):
        self.probs = probs if probs is not None else [("en", 0.9), ("tl", 0.1)]
        self.segments = list(segments)
        self.detect_error = detect_error
        self.detect_calls: list[dict] = []
        self.transcribe_calls: list[dict] = []

    def detect_language(self, audio=None, **kwargs):
        self.detect_calls.append({"audio": audio, **kwargs})
        if self.detect_error is not None:
            raise self.detect_error
        top = max(self.probs, key=lambda p: p[1])
        return top[0], top[1], self.probs

    def transcribe(self, audio, **kwargs):
        self.transcribe_calls.append({"audio": audio, **kwargs})
        return iter(FakeSegment(t) for t in self.segments), None


class CountingFactory:
    def __init__(self, model=None, delay: float = 0.0, fail_times: int = 0):
        self.model = model or FakeWhisperModel()
        self.delay = delay
        self.fail_times = fail_times
        self.calls = 0
        self._lock = threading.Lock()

    def __call__(self, name):
        with self._lock:
            self.calls += 1
            call_no = self.calls
        if self.delay:
            time.sleep(self.delay)
        if call_no <= self.fail_times:
            raise RuntimeError("model files missing")
        return self.model


@pytest.fixture(autouse=True)
def reset_stt():
    stt._reset_for_tests()
    yield
    stt._reset_for_tests()


@pytest.fixture
def audio_file(tmp_path):
    path = tmp_path / "clip.wav"
    path.write_bytes(b"not really audio")
    return path


def install(monkeypatch, factory=None, audio=None):
    factory = factory or CountingFactory()
    monkeypatch.setattr(stt, "_create_model", factory)
    audio = audio if audio is not None else FakeAudio(16000)
    monkeypatch.setattr(stt, "_decode", lambda path: audio)
    return factory


# --- Requirement 10: model loading -----------------------------------------


def test_model_loaded_once_across_many_calls(monkeypatch, audio_file):
    factory = install(monkeypatch, CountingFactory(FakeWhisperModel(segments=["hi"])))
    for _ in range(5):
        assert stt.transcribe(audio_file) == "hi"
    assert stt.load_model() is factory.model
    assert factory.calls == 1


def test_concurrent_first_calls_load_once(monkeypatch, audio_file):
    factory = install(
        monkeypatch, CountingFactory(FakeWhisperModel(segments=["ok"]), delay=0.2)
    )
    results: list[str] = []
    errors: list[BaseException] = []
    barrier = threading.Barrier(8)

    def worker():
        try:
            barrier.wait()
            results.append(stt.transcribe(audio_file))
        except BaseException as exc:  # pragma: no cover - surfaced below
            errors.append(exc)

    threads = [threading.Thread(target=worker) for _ in range(8)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=10)

    assert errors == []
    assert results == ["ok"] * 8
    assert factory.calls == 1


def test_failed_load_raises_stt_load_error_with_cause(monkeypatch, audio_file):
    install(monkeypatch, CountingFactory(fail_times=1))
    with pytest.raises(stt.STTLoadError) as info:
        stt.transcribe(audio_file)
    assert isinstance(info.value, stt.STTError)
    assert "model files missing" in str(info.value)
    assert isinstance(info.value.__cause__, RuntimeError)
    assert stt._model is None


def test_load_retries_after_failure(monkeypatch, audio_file):
    factory = install(
        monkeypatch, CountingFactory(FakeWhisperModel(segments=["again"]), fail_times=1)
    )
    with pytest.raises(stt.STTLoadError):
        stt.load_model()
    assert stt.transcribe(audio_file) == "again"
    assert factory.calls == 2


# --- Requirement 11: transcription ------------------------------------------


def test_transcript_joined_and_stripped(monkeypatch, audio_file):
    model = FakeWhisperModel(segments=["  Nasaan si Ana? ", "", "   ", "Thank you.  "])
    install(monkeypatch, CountingFactory(model))
    assert stt.transcribe(audio_file) == "Nasaan si Ana? Thank you."


def test_vad_filter_enabled_on_both_calls(monkeypatch, audio_file):
    model = FakeWhisperModel(segments=["hello"])
    install(monkeypatch, CountingFactory(model))
    stt.transcribe(audio_file)
    assert model.detect_calls[0]["vad_filter"] is True
    assert model.transcribe_calls[0]["vad_filter"] is True
    assert model.transcribe_calls[0]["beam_size"] == 5


@pytest.mark.parametrize(
    "probs, expected",
    [
        ([("en", 0.8), ("tl", 0.2)], "en"),
        ([("tl", 0.7), ("en", 0.3)], "tl"),
        # Another language detected on top: pick the higher of en / tl.
        ([("es", 0.9), ("tl", 0.06), ("en", 0.04)], "tl"),
        ([("ja", 0.95), ("en", 0.03), ("tl", 0.02)], "en"),
        # Neither en nor tl present: default en.
        ([("fr", 1.0)], "en"),
    ],
)
def test_language_restricted_to_en_or_tl(monkeypatch, audio_file, probs, expected):
    model = FakeWhisperModel(probs=probs, segments=["x"])
    install(monkeypatch, CountingFactory(model))
    stt.transcribe(audio_file)
    assert model.transcribe_calls[0]["language"] == expected


def test_detect_language_error_defaults_to_en(monkeypatch, audio_file):
    model = FakeWhisperModel(segments=["x"], detect_error=RuntimeError("no speech"))
    install(monkeypatch, CountingFactory(model))
    assert stt.transcribe(audio_file) == "x"
    assert model.transcribe_calls[0]["language"] == "en"


def test_no_segments_returns_empty_string(monkeypatch, audio_file):
    install(monkeypatch, CountingFactory(FakeWhisperModel(segments=[])))
    assert stt.transcribe(audio_file) == ""


def test_zero_length_audio_returns_empty_without_model_calls(monkeypatch, audio_file):
    model = FakeWhisperModel(segments=["should not appear"])
    install(monkeypatch, CountingFactory(model), audio=FakeAudio(0))
    assert stt.transcribe(audio_file) == ""
    assert model.detect_calls == []
    assert model.transcribe_calls == []


def test_missing_path_raises_audio_unreadable(monkeypatch, tmp_path):
    install(monkeypatch)
    missing = tmp_path / "nope.m4a"
    with pytest.raises(stt.AudioUnreadable) as info:
        stt.transcribe(missing)
    assert str(missing) in str(info.value)


def test_directory_path_raises_audio_unreadable(monkeypatch, tmp_path):
    install(monkeypatch)
    with pytest.raises(stt.AudioUnreadable):
        stt.transcribe(tmp_path)


def test_decode_error_raises_audio_unreadable_with_cause(monkeypatch, audio_file):
    """Exercise the real ``_decode`` with a fake faster_whisper decoder."""
    monkeypatch.setattr(stt, "_create_model", CountingFactory())

    def bad_decode(path, sampling_rate):
        raise ValueError("invalid data found when processing input")

    fake_fw = types.ModuleType("faster_whisper")
    fake_fw.decode_audio = bad_decode
    monkeypatch.setitem(sys.modules, "faster_whisper", fake_fw)

    with pytest.raises(stt.AudioUnreadable) as info:
        stt.transcribe(audio_file)
    message = str(info.value)
    assert str(audio_file) in message
    assert "invalid data" in message
    assert isinstance(info.value.__cause__, ValueError)
