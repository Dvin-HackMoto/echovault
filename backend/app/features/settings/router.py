# game topics, difficulty, prompt frequency, quiet hours
#
# SET-1 (settings) and SET-2 (patient profile) endpoints. Both live here per
# DELEGATION/README.md. No DTOs — handlers take `payload: dict = Body(...)` and
# validate required fields / enum values manually against constants.py.

import json
import re

from fastapi import APIRouter, Body, Depends, HTTPException

from app import constants
from app.database.connection import get_db
from app.middleware.dependencies import get_role, require_caregiver

router = APIRouter(tags=["settings"])

# Matches a 24-hour "HH:MM" clock value.
_HHMM_RE = re.compile(r"^\d{2}:\d{2}$")


# ──────────────────────────── tiny settings repo ────────────────────────────


def _read_all_settings(conn):
    """Return every settings key as parsed JSON, falling back to defaults.

    Missing keys fall back to constants.SETTINGS_DEFAULTS so the response is
    never empty and never 404.
    """
    result = dict(constants.SETTINGS_DEFAULTS)
    for row in conn.execute("SELECT key, value FROM settings"):
        result[row["key"]] = json.loads(row["value"])
    return result


def _upsert_setting(conn, key, value):
    """Store a settings value as a JSON string, keyed by key."""
    conn.execute(
        "INSERT INTO settings (key, value, updated_at) "
        "VALUES (?, ?, datetime('now','localtime')) "
        "ON CONFLICT(key) DO UPDATE SET value = excluded.value, "
        "updated_at = datetime('now','localtime')",
        (key, json.dumps(value)),
    )


# ──────────────────────────── shape validation ──────────────────────────────


def _validate_game_topics(value):
    if not isinstance(value, list):
        raise HTTPException(status_code=400, detail="game_topics must be a list")
    for topic in value:
        if topic not in constants.ALLOWED_GAME_TOPICS:
            raise HTTPException(
                status_code=400, detail="unknown game topic: {}".format(topic)
            )


def _validate_game_difficulty(value):
    # bool is a subclass of int — reject it explicitly.
    if isinstance(value, bool) or not isinstance(value, int) or not (1 <= value <= 3):
        raise HTTPException(
            status_code=400, detail="game_difficulty must be an int in 1..3"
        )


def _validate_trivia_frequency_min(value):
    if isinstance(value, bool) or not isinstance(value, int) or value <= 0:
        raise HTTPException(
            status_code=400, detail="trivia_frequency_min must be a positive int"
        )


def _validate_hhmm(label, value):
    if not isinstance(value, str) or not _HHMM_RE.match(value):
        raise HTTPException(
            status_code=400, detail="quiet_hours.{} must be HH:MM".format(label)
        )
    hour, minute = int(value[:2]), int(value[3:])
    if not (0 <= hour <= 23 and 0 <= minute <= 59):
        raise HTTPException(
            status_code=400,
            detail="quiet_hours.{} must be a valid 24h time".format(label),
        )


def _validate_quiet_hours(value):
    if not isinstance(value, dict) or "start" not in value or "end" not in value:
        raise HTTPException(
            status_code=400,
            detail="quiet_hours must be an object with 'start' and 'end'",
        )
    _validate_hhmm("start", value["start"])
    _validate_hhmm("end", value["end"])


_SETTINGS_VALIDATORS = {
    "game_topics": _validate_game_topics,
    "game_difficulty": _validate_game_difficulty,
    "trivia_frequency_min": _validate_trivia_frequency_min,
    "quiet_hours": _validate_quiet_hours,
}


# ─────────────────────────────── SET-1 settings ─────────────────────────────


@router.get("/settings")
def get_settings(identity=Depends(get_role), conn=Depends(get_db)):
    """Return all four settings keys as parsed JSON. Readable by any role."""
    return _read_all_settings(conn)


@router.put("/settings")
def update_settings(
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Validate the shape of each provided settings key, then upsert it.

    Only keys present in the payload are updated. Unknown keys are rejected.
    Caregiver only.
    """
    if not payload:
        raise HTTPException(status_code=400, detail="empty settings payload")

    for key in payload:
        if key not in _SETTINGS_VALIDATORS:
            raise HTTPException(
                status_code=400, detail="unknown setting: {}".format(key)
            )

    for key, value in payload.items():
        _SETTINGS_VALIDATORS[key](value)

    for key, value in payload.items():
        _upsert_setting(conn, key, value)
    conn.commit()

    return _read_all_settings(conn)


# ──────────────────────────── SET-2 patient profile ─────────────────────────

# The patient app can read the profile before setup to apply font scale, voice
# and managed mode, so GET returns an empty object (not 404) when unset.

_PATIENT_FIELDS = (
    "full_name",
    "preferred_name",
    "birth_date",
    "photo_path",
    "language",
    "font_scale",
    "voice_enabled",
    "managed_mode",
)


@router.get("/patient")
def get_patient(identity=Depends(get_role), conn=Depends(get_db)):
    """Return the single patient row, or {} if not yet created. Any role."""
    row = conn.execute("SELECT * FROM patient WHERE id = 1").fetchone()
    return dict(row) if row is not None else {}


@router.put("/patient")
def update_patient(
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Upsert the single patient row (id = 1). Never creates a second row.

    full_name is required when creating. language is limited to
    constants.LANGUAGES. Caregiver only.
    """
    if "language" in payload and payload["language"] not in constants.LANGUAGES:
        raise HTTPException(
            status_code=400,
            detail="language must be one of {}".format(list(constants.LANGUAGES)),
        )

    exists = (
        conn.execute("SELECT 1 FROM patient WHERE id = 1").fetchone() is not None
    )
    if not exists and not payload.get("full_name"):
        raise HTTPException(
            status_code=400, detail="full_name is required to create the profile"
        )

    provided = {k: payload[k] for k in _PATIENT_FIELDS if k in payload}

    if not exists:
        columns = ["id"] + list(provided.keys())
        placeholders = ["1"] + ["?"] * len(provided)
        conn.execute(
            "INSERT INTO patient ({}) VALUES ({})".format(
                ", ".join(columns), ", ".join(placeholders)
            ),
            tuple(provided.values()),
        )
    elif provided:
        assignments = ", ".join("{} = ?".format(k) for k in provided)
        conn.execute(
            "UPDATE patient SET {}, updated_at = datetime('now','localtime') "
            "WHERE id = 1".format(assignments),
            tuple(provided.values()),
        )
    else:
        conn.execute(
            "UPDATE patient SET updated_at = datetime('now','localtime') WHERE id = 1"
        )
    conn.commit()

    row = conn.execute("SELECT * FROM patient WHERE id = 1").fetchone()
    return dict(row)
