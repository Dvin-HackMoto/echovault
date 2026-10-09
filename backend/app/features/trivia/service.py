# pick next trivia prompt, or none during quiet periods; record outcomes; validate questions
#
# A prompt is optional and never a test. next_prompt() returns nothing when:
#   - the time is inside the caregiver's quiet_hours,
#   - a schedule item starts within 30 minutes, is running, or ended less than 30 minutes
#     ago (this covers every item with is_quiet_period = 1 while it runs),
#   - the last prompt was answered or skipped less than trivia_frequency_min ago.
# Otherwise it picks an active question, see _pick().
#
# Outcomes are engagement only: 'completed' (the patient did something with the prompt)
# or 'skipped' (closed it). Whether an answer was right is never stored.
#
# Other modules can call:
#   next_prompt(conn)          the prompt to show now, or None
#   suppression_reason(conn)   'quiet_hours' | 'schedule' | 'frequency' | None

import json
import random
from datetime import datetime, timedelta, timezone

from fastapi import HTTPException

from . import repository
from .deps import (
    ALLOWED_GAME_TOPICS, TRIVIA_GENERAL, TRIVIA_KINDS, TRIVIA_SOURCE_PRELOADED,
    busy_schedule, read_settings,
)

MANILA = timezone(timedelta(hours=8))
DT_FORMAT = "%Y-%m-%d %H:%M:%S"
SCHEDULE_MARGIN = timedelta(minutes=30)
OUTCOMES = ("completed", "skipped")

_random = random.Random()


def manila_now():
    return datetime.now(MANILA).replace(tzinfo=None, microsecond=0)


# ─────────────────────────────── when to stay quiet ─────────────────────────────


def in_quiet_hours(now, quiet_hours):
    """quiet_hours is {"start": "21:00", "end": "07:00"}; it may run past midnight.
    The start minute is quiet, the end minute is not."""
    start, end = (quiet_hours or {}).get("start"), (quiet_hours or {}).get("end")
    if not start or not end or start == end:
        return False
    clock = now.strftime("%H:%M")
    if start < end:
        return start <= clock < end
    return clock >= start or clock < end


def suppression_reason(conn, now=None, settings=None):
    now = now or manila_now()
    settings = settings or read_settings(conn)
    if in_quiet_hours(now, settings["quiet_hours"]):
        return "quiet_hours"
    if busy_schedule(conn, now - SCHEDULE_MARGIN, now + SCHEDULE_MARGIN):
        return "schedule"
    last = repository.last_result(conn)
    if last:
        since = now - datetime.strptime(last["created_at"], DT_FORMAT)
        # a result stamped in the future (a clock that was set back) does not block prompts
        if timedelta(0) <= since < timedelta(minutes=settings["trivia_frequency_min"]):
            return "frequency"
    return None


# ───────────────────────────────── the next prompt ──────────────────────────────


def _pick(conn, questions):
    """General trivia and questions about the patient's own life take turns, so the
    patient gets a mix. Within a turn the question shown longest ago (or never) goes
    first, so nothing repeats while there is something else to ask."""
    general = [q for q in questions if q["kind"] == TRIVIA_GENERAL]
    personal = [q for q in questions if q["kind"] != TRIVIA_GENERAL]
    last = repository.last_result(conn)
    last_question = repository.get_question(conn, last["question_ref"]) if last and last["question_ref"] else None
    last_was_personal = bool(last_question) and last_question["kind"] != TRIVIA_GENERAL
    first, second = (general, personal) if last_was_personal else (personal, general)
    pool = first or second
    if not pool:
        return None
    shown = repository.last_shown(conn)
    oldest = min(shown.get(q["id"], "") for q in pool)
    return _random.choice([q for q in pool if shown.get(q["id"], "") == oldest])


def as_prompt(conn, question):
    people = repository.people_for(conn, question)
    return {
        **question,
        "people": [{**p, "photo_url": f"/photos/{p['photo_path']}" if p["photo_path"] else None} for p in people],
    }


def next_prompt(conn, now=None):
    now = now or manila_now()
    settings = read_settings(conn)
    if suppression_reason(conn, now, settings):
        return None
    question = _pick(conn, repository.askable_questions(
        conn, settings["game_topics"], settings["game_difficulty"], now.strftime(DT_FORMAT)
    ))
    return as_prompt(conn, question) if question else None


def record_result(conn, payload, now=None):
    """Body: {question_id, outcome: completed|skipped, duration_sec?}."""
    question = repository.get_question(conn, str(payload.get("question_id") or ""))
    if question is None:
        raise HTTPException(404, "Question not found")
    if payload.get("outcome") not in OUTCOMES:
        raise HTTPException(422, f"outcome must be one of {', '.join(OUTCOMES)}")
    duration = _whole_number(payload.get("duration_sec"), "duration_sec", 0, None, default=None)
    return repository.insert_result(
        conn, question, payload["outcome"], duration, (now or manila_now()).strftime(DT_FORMAT)
    )


# ───────────────────────────── caregiver-written questions ──────────────────────


def _text(value):
    if value is None:
        return None
    return str(value).strip() or None


def _flag(value, field):
    if value in (True, 1, "1", "true"):
        return 1
    if value in (False, 0, "0", "false"):
        return 0
    raise HTTPException(422, f"{field} must be true or false")


def _whole_number(value, field, minimum, maximum, default):
    if value is None or value == "":
        return default
    if isinstance(value, bool) or not isinstance(value, (int, str)) or not str(value).strip().isdigit():
        raise HTTPException(422, f"{field} must be a whole number")
    number = int(value)
    if number < minimum or (maximum is not None and number > maximum):
        raise HTTPException(422, f"{field} must be {minimum} or more" if maximum is None
                            else f"{field} must be between {minimum} and {maximum}")
    return number


def _choices(value, answer):
    """None for open recall, or the choices as the JSON array string the table stores."""
    if isinstance(value, str) and value.strip():
        try:
            value = json.loads(value)
        except ValueError:
            raise HTTPException(422, "choices must be a list of answers")
    if value is None or value == "" or value == []:
        return None
    if not isinstance(value, list):
        raise HTTPException(422, "choices must be a list of answers")
    choices = [_text(c) for c in value]
    if None in choices or len(choices) < 2:
        raise HTTPException(422, "choices needs at least two answers, none of them empty")
    lowered = [c.lower() for c in choices]
    if len(set(lowered)) != len(lowered):
        raise HTTPException(422, "choices must all be different")
    if answer and answer.lower() not in lowered:
        raise HTTPException(422, "choices must include the answer")
    return json.dumps(choices, ensure_ascii=False)


def validate_question(conn, payload, now=None):
    """Checks a complete question (create, or saved row merged with an update)."""
    kind = payload.get("kind")
    if kind not in TRIVIA_KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(TRIVIA_KINDS)}")
    question = {
        "kind": kind,
        "topic": _text(payload.get("topic")),
        "question": _text(payload.get("question")),
        "answer": _text(payload.get("answer")),
        "memory_id": _text(payload.get("memory_id")),
        "difficulty": _whole_number(payload.get("difficulty"), "difficulty", 1, 3, default=1),
        "is_active": _flag(payload.get("is_active", 1), "is_active"),
    }
    if not question["question"]:
        raise HTTPException(422, "question is required")
    if not question["answer"]:
        raise HTTPException(422, "answer is required")
    question["choices"] = _choices(payload.get("choices"), question["answer"])

    if kind == TRIVIA_GENERAL:
        if question["memory_id"]:
            raise HTTPException(422, "a general question cannot have a memory_id")
        return question
    # personal, family and routine questions are about the patient's own life
    if question["topic"] not in ALLOWED_GAME_TOPICS:
        raise HTTPException(422, f"topic must be one of {', '.join(ALLOWED_GAME_TOPICS)}")
    if not question["memory_id"]:
        raise HTTPException(422, f"a {kind} question needs the memory_id of a verified memory")
    stamp = (now or manila_now()).strftime(DT_FORMAT)
    if not repository.memory_is_usable(conn, question["memory_id"], stamp):
        raise HTTPException(422, "memory_id must be a memory that is verified and currently valid")
    return question


def update(conn, existing, payload, now=None):
    if existing["source"] == TRIVIA_SOURCE_PRELOADED:
        # the file would bring an edit back on the next startup; on/off is kept
        if set(payload) - {"is_active"} or "is_active" not in payload:
            raise HTTPException(409, "A preloaded question can only be switched on or off (is_active)")
        repository.set_active(conn, existing["id"], _flag(payload["is_active"], "is_active"))
    elif set(payload) == {"is_active"}:
        # switching off must work even after the question's memory stopped being verified
        repository.set_active(conn, existing["id"], _flag(payload["is_active"], "is_active"))
    else:
        repository.update_question(conn, existing["id"], validate_question(conn, {**existing, **payload}, now))
    return repository.get_question(conn, existing["id"])


def delete(conn, existing):
    if existing["source"] == TRIVIA_SOURCE_PRELOADED:
        raise HTTPException(409, "A preloaded question cannot be deleted; switch it off instead (is_active)")
    repository.delete_question(conn, existing["id"])
