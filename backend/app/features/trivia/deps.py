# The only place Trivia imports from other modules (HUB-1, HUB-2, HUB-4, SCH-2, SET-1).
#
#   get_role()            returns "patient" or "caregiver"
#   require_caregiver     returns the caregiver row (dict)
#   busy_schedule()       SCH-2: schedule occurrences that overlap a time window
#   read_settings()       SET-1: the settings table over its defaults
#
# Memories (MEM) has no functions to call yet. Trivia only needs to know whether a
# question's memory is verified and currently valid, which repository.py reads from the
# `memories` table itself.
import json

from app import config
from app.constants import (
    ALLOWED_GAME_TOPICS, ROLE_CAREGIVER, SETTINGS_DEFAULTS, TRIVIA_GENERAL, TRIVIA_KINDS,
    TRIVIA_SOURCE_CAREGIVER, TRIVIA_SOURCE_PRELOADED, TRIVIA_SOURCES,
)
from app.database.connection import connect, get_db
from app.features.schedule import service as _schedule
from app.middleware.dependencies import get_role, require_caregiver

__all__ = [
    "ALLOWED_GAME_TOPICS", "ROLE_CAREGIVER", "TRIVIA_GENERAL", "TRIVIA_KINDS",
    "TRIVIA_SOURCE_CAREGIVER", "TRIVIA_SOURCE_PRELOADED", "TRIVIA_SOURCES",
    "connect", "get_db", "get_role", "require_caregiver",
    "busy_schedule", "read_settings", "trivia_file",
]


def trivia_file():
    # read on every call (not copied at import) so tests can monkeypatch app.config
    return config.ASSETS_DIR / "trivia.json"


def busy_schedule(conn, start, end):
    """Active schedule occurrences that overlap [start, end], one already running included."""
    return _schedule.occurrences_between(conn, start, end)


def read_settings(conn):
    """Every setting as parsed JSON; a key nobody has saved yet has its default."""
    settings = dict(SETTINGS_DEFAULTS)
    for row in conn.execute("SELECT key, value FROM settings"):
        settings[row["key"]] = json.loads(row["value"])
    return settings
