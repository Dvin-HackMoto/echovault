"""Enumerations and defaults shared across the backend.

These values MUST match the CHECK constraints in database/schema.sql exactly.
Routers validate incoming payloads against these tuples/sets manually (the
project convention is no DTOs / no schemas.py).
"""

# ─── schema CHECK constraints (keep in sync with schema.sql) ───
CATEGORIES = ("identity", "routine", "history", "preference", "care_safety", "engagement")
IMPORTANCE = ("critical", "important", "general")
TRUST = ("verified", "unverified", "conflicting", "outdated")
VALIDITY = ("persistent", "scheduled", "temporary", "archived")
MEDICATION_STATUSES = ("unconfirmed", "taken", "skipped")
ROLES = ("patient", "caregiver")
ACCESS_LEVELS = ("admin", "editor", "viewer")
LANGUAGES = ("fil", "en", "fil-en")

# FIXED set of game/trivia topics. Topics not in this list are rejected by the
# settings endpoints. Derived from the seed values plus the game/trivia vocab
# implied by ARCHITECTURE sections 8-9 and PRODUCT features 6-7.
ALLOWED_GAME_TOPICS = [
    "family_names",
    "relationships",
    "routines",
    "familiar_places",
    "recent_events",
]

# Default settings values, written as JSON into the `settings` table.
SETTINGS_DEFAULTS = {
    "game_topics": ["family_names", "relationships", "routines"],
    "game_difficulty": 1,
    "trivia_frequency_min": 120,
    "quiet_hours": {"start": "21:00", "end": "07:00"},
}
