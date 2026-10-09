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

# ─── memories.source CHECK constraint (keep in sync with schema.sql) ───
MEMORY_SOURCES = ("caregiver", "patient", "ai_suggested", "import")

# ─── singular enum members (Module 03/04 named constants) ───
# Values match the schema CHECK constraints exactly. Added for the People /
# Memories domain so routers/services can reference named members rather than
# bare strings. Purely additive — do not remove or rename.
ROLE_PATIENT = "patient"
ROLE_CAREGIVER = "caregiver"

ACCESS_ADMIN = "admin"
ACCESS_EDITOR = "editor"
ACCESS_VIEWER = "viewer"

TRUST_VERIFIED = "verified"
TRUST_UNVERIFIED = "unverified"
TRUST_CONFLICTING = "conflicting"
TRUST_OUTDATED = "outdated"

CATEGORY_IDENTITY = "identity"
CATEGORY_ROUTINE = "routine"
CATEGORY_HISTORY = "history"
CATEGORY_PREFERENCE = "preference"
CATEGORY_CARE_SAFETY = "care_safety"
CATEGORY_ENGAGEMENT = "engagement"

IMPORTANCE_CRITICAL = "critical"
IMPORTANCE_IMPORTANT = "important"
IMPORTANCE_GENERAL = "general"

VALIDITY_PERSISTENT = "persistent"
VALIDITY_SCHEDULED = "scheduled"
VALIDITY_TEMPORARY = "temporary"
VALIDITY_ARCHIVED = "archived"

SOURCE_CAREGIVER = "caregiver"
SOURCE_PATIENT = "patient"
SOURCE_AI_SUGGESTED = "ai_suggested"
SOURCE_IMPORT = "import"
