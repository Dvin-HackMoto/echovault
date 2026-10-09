# the only place games reads data from other modules
#
# Every generator gets its rows from here, so the "verified only" rule lives in one file.
# Modules that already publish lookups are called directly:
#   people_with_photos / verified_people   features/people/service.py (PPL-2)
#   verified_places                        features/places/service.py (PPL-3)
#   routine_today                          features/schedule/service.py (SCH-2)
#   settings                               features/settings/router.py (SET-1)
#   personal_trivia                        features/trivia/service.py (TRV)
# Memories (MEM) has no lookups yet, so usable_memories() reads that table itself,
# read-only, and filters with app.ai.records.is_usable (the same rule the assistant
# uses). When MEM-2 publishes a lookup, swap that one query; nothing else changes.

from app import constants
from app.ai.records import is_usable
from app.features.people import service as people_service
from app.features.places import service as places_service
from app.features.schedule import service as schedule_service
from app.features.settings.router import _read_all_settings
from app.features.trivia import service as trivia_service

# schedule kinds that make up the daily routine (appointments and visits are one-offs)
ROUTINE_KINDS = (constants.SCHEDULE_ROUTINE, constants.SCHEDULE_MEAL, constants.SCHEDULE_ACTIVITY)


def with_photo_url(row):
    return people_service.with_photo_url(row)


# ───────────────────────────────── settings ─────────────────────────────────────


def game_settings(conn):
    """(topics, difficulty) from the caregiver's settings, cleaned so a bad stored
    value can never break a round: unknown topics are dropped, difficulty is 1..3."""
    values = _read_all_settings(conn)
    topics = values.get("game_topics")
    topics = [t for t in topics if t in constants.ALLOWED_GAME_TOPICS] if isinstance(topics, list) else []
    difficulty = values.get("game_difficulty")
    if isinstance(difficulty, bool) or not isinstance(difficulty, int):
        difficulty = constants.SETTINGS_DEFAULTS["game_difficulty"]
    return topics, min(3, max(1, difficulty))


# ───────────────────────────── people and places ────────────────────────────────


def people_with_photos(conn):
    return people_service.people_with_photos(conn)


def verified_people(conn):
    return people_service.verified_people(conn)


def verified_places(conn):
    return places_service.verified_places(conn)


# ───────────────────────────────── memories ─────────────────────────────────────


def usable_memories(conn, category=None):
    """Memories the patient may be shown right now: verified, not archived, not in a
    conflict and inside valid_from / valid_until. Each row gets `photo_url`."""
    sql = "SELECT * FROM memories WHERE trust = ?"
    args = [constants.TRUST_VERIFIED]
    if category:
        sql += " AND category = ?"
        args.append(category)
    rows = [dict(r) for r in conn.execute(sql + " ORDER BY id", args).fetchall()]
    return [with_photo_url(r) for r in rows if is_usable(r)]


# ────────────────────────────────── trivia ──────────────────────────────────────


def personal_trivia(conn, topics, max_difficulty):
    """Active questions about the patient's own life on `topics`, up to `max_difficulty`,
    from the trivia module (TRV). Each row gets `memory` (the linked memory row); a row
    whose memory fails is_usable here too (e.g. still linked to a conflict) is dropped."""
    rows = trivia_service.personal_questions(conn, topics, max_difficulty)
    if not rows:
        return []
    memories = {m["id"]: m for m in usable_memories(conn)}
    return [{**row, "memory": memories[row["memory_id"]]} for row in rows if row.get("memory_id") in memories]


# ───────────────────────────────── schedule ─────────────────────────────────────


def routine_today(conn, day=None):
    """Today's routine, meal and activity occurrences in time order, one per title."""
    seen, routine = set(), []
    for occ in schedule_service.today(conn, day):
        key = occ["title"].strip().lower()
        if occ["kind"] in ROUTINE_KINDS and key not in seen:
            seen.add(key)
            routine.append(occ)
    return routine
