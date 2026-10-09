# POST /assistant/ask {text}, POST /assistant/voice (audio),
# GET /assistant/log, POST /assistant/log/{id}/flag (caregiver)

import os
import tempfile

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from app.ai import fallback, stt
from app.ai.records import now_manila
from app.database.connection import get_db
from app.features.people import service as people
from app.middleware.dependencies import get_role, require_caregiver

from . import answer, intent, repository, retrieve

router = APIRouter(prefix="/assistant", tags=["assistant"])

MAX_AUDIO_BYTES = 20 * 1024 * 1024  # a held-down question is well under 1 MB
DIDNT_CATCH = {
    "en": "Sorry, I didn't catch that. Please try again, or type your question.",
    "fil": "Paumanhin, hindi ko iyon narinig nang maayos. Pakiulit, o i-type ang tanong mo.",
}


def respond(conn, question, input_mode="text"):
    """Intent, retrieve, answer, log. Text and voice both end up here."""
    now = now_manila()
    detected = intent.detect(question)
    found = retrieve.retrieve(conn, detected, question, now)
    built = answer.build(
        question, detected["intent"], found,
        language=repository.patient_language(conn), caregiver=people.fallback_caregiver(conn), now=now,
    )
    repository.add_log(
        conn, question, input_mode, detected["intent"], built["answer"], built["answer_mode"], built["record_ids"]
    )
    return {
        "answer": built["answer"],
        "answer_mode": built["answer_mode"],
        "intent": detected["intent"],
        "people": built["people"],
        "memory_ids": built["record_ids"],
    }


@router.post("/ask", dependencies=[Depends(get_role)])
def ask(payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {text}. Open to the patient (no PIN) and to caregivers."""
    text = payload.get("text")
    if not isinstance(text, str) or not text.strip():
        raise HTTPException(422, 'text is required: send the question as {"text": "..."}')
    return respond(conn, text.strip())


def _transcribe(upload):
    """The words in an uploaded recording, or "" when there are none. The recording is
    written to a temporary file for Whisper and deleted again, whatever happens."""
    data = upload.file.read(MAX_AUDIO_BYTES + 1)
    if len(data) > MAX_AUDIO_BYTES:
        raise HTTPException(413, "The recording is too long")
    if not data:
        return ""
    ext = os.path.splitext(upload.filename or "")[1].lower()
    handle, path = tempfile.mkstemp(prefix="echovault-voice-", suffix=ext if ext[1:].isalnum() else ".m4a")
    try:
        with os.fdopen(handle, "wb") as audio_file:
            audio_file.write(data)
        return stt.transcribe(path).strip()
    except stt.AudioUnreadable:
        return ""
    except stt.STTLoadError:
        raise HTTPException(503, "Voice is not available right now. Please type your question.")
    finally:
        os.unlink(path)


@router.post("/voice", dependencies=[Depends(get_role)])
def voice(audio: UploadFile = File(...), conn=Depends(get_db)):
    """Multipart field `audio`. Same response as /assistant/ask, plus `transcript`."""
    transcript = _transcribe(audio)
    if not transcript:
        # nothing was understood, so nothing is looked up, answered or logged
        language = fallback.fallback_language(repository.patient_language(conn))
        return {
            "answer": DIDNT_CATCH[language], "answer_mode": "no_data", "intent": None,
            "people": [], "memory_ids": [], "transcript": "",
        }
    return {**respond(conn, transcript, input_mode="voice"), "transcript": transcript}


# ──────────────────────────── caregiver: review answers ─────────────────────────


def _with_records(conn, log):
    return {**log, "records": repository.records_used(conn, repository.record_ids(log))}


@router.get("/log", dependencies=[Depends(require_caregiver)])
def list_log(limit: int = 50, flagged: bool | None = None, conn=Depends(get_db)):
    """Recent questions and answers, newest first, each with the `records` it was built
    from. ?flagged=true gives only the answers marked as wrong."""
    logs = repository.list_logs(conn, max(1, min(limit, 200)), flagged)
    return [_with_records(conn, log) for log in logs]


@router.post("/log/{log_id}/flag", dependencies=[Depends(require_caregiver)])
def flag(log_id: str, payload: dict | None = Body(default=None), conn=Depends(get_db)):
    """Marks an answer as wrong. Body {"flagged": false} clears the mark again."""
    flagged = (payload or {}).get("flagged", True)
    if flagged not in (True, False, 0, 1):
        raise HTTPException(422, "flagged must be true or false")
    if repository.get_log(conn, log_id) is None:
        raise HTTPException(404, "Answer not found")
    repository.set_flagged(conn, log_id, flagged)
    return _with_records(conn, repository.get_log(conn, log_id))
