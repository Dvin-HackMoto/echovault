# categories, importance, trust, validity, med statuses, roles
# Values mirror the CHECK constraints in database/schema.sql (tests/test_constants.py keeps them in sync).

# request roles (X-Role header)
ROLE_PATIENT = "patient"
ROLE_CAREGIVER = "caregiver"
ROLES = (ROLE_PATIENT, ROLE_CAREGIVER)

# patient
LANGUAGES = ("fil", "en", "fil-en")

# caregivers
ACCESS_ADMIN = "admin"
ACCESS_EDITOR = "editor"
ACCESS_VIEWER = "viewer"
ACCESS_LEVELS = (ACCESS_ADMIN, ACCESS_EDITOR, ACCESS_VIEWER)

# memories (trust is shared by people and places)
CATEGORY_IDENTITY = "identity"
CATEGORY_ROUTINE = "routine"
CATEGORY_HISTORY = "history"
CATEGORY_PREFERENCE = "preference"
CATEGORY_CARE_SAFETY = "care_safety"
CATEGORY_ENGAGEMENT = "engagement"
CATEGORIES = (
    CATEGORY_IDENTITY, CATEGORY_ROUTINE, CATEGORY_HISTORY,
    CATEGORY_PREFERENCE, CATEGORY_CARE_SAFETY, CATEGORY_ENGAGEMENT,
)

IMPORTANCE_CRITICAL = "critical"
IMPORTANCE_IMPORTANT = "important"
IMPORTANCE_GENERAL = "general"
IMPORTANCE_LEVELS = (IMPORTANCE_CRITICAL, IMPORTANCE_IMPORTANT, IMPORTANCE_GENERAL)

TRUST_VERIFIED = "verified"
TRUST_UNVERIFIED = "unverified"
TRUST_CONFLICTING = "conflicting"
TRUST_OUTDATED = "outdated"
TRUST_STATUSES = (TRUST_VERIFIED, TRUST_UNVERIFIED, TRUST_CONFLICTING, TRUST_OUTDATED)

VALIDITY_PERSISTENT = "persistent"
VALIDITY_SCHEDULED = "scheduled"
VALIDITY_TEMPORARY = "temporary"
VALIDITY_ARCHIVED = "archived"
VALIDITY_TYPES = (VALIDITY_PERSISTENT, VALIDITY_SCHEDULED, VALIDITY_TEMPORARY, VALIDITY_ARCHIVED)

SOURCE_CAREGIVER = "caregiver"
SOURCE_PATIENT = "patient"
SOURCE_AI_SUGGESTED = "ai_suggested"
SOURCE_IMPORT = "import"
MEMORY_SOURCES = (SOURCE_CAREGIVER, SOURCE_PATIENT, SOURCE_AI_SUGGESTED, SOURCE_IMPORT)

# schedule
SCHEDULE_APPOINTMENT = "appointment"
SCHEDULE_ROUTINE = "routine"
SCHEDULE_MEAL = "meal"
SCHEDULE_VISIT = "visit"
SCHEDULE_ACTIVITY = "activity"
SCHEDULE_KINDS = (
    SCHEDULE_APPOINTMENT, SCHEDULE_ROUTINE, SCHEDULE_MEAL, SCHEDULE_VISIT, SCHEDULE_ACTIVITY,
)
ACK_RESPONSES = ("acknowledged", "dismissed", "snoozed")

# medications
MED_STATUSES = ("unconfirmed", "taken", "skipped")
MED_CONFIRMED_BY = ("none", "patient", "caregiver")

# games and trivia
TRIVIA_GENERAL = "general"
TRIVIA_PERSONAL = "personal"
TRIVIA_ROUTINE = "routine"
TRIVIA_FAMILY = "family"
TRIVIA_KINDS = (TRIVIA_GENERAL, TRIVIA_PERSONAL, TRIVIA_ROUTINE, TRIVIA_FAMILY)

TRIVIA_SOURCE_PRELOADED = "preloaded"
TRIVIA_SOURCE_CAREGIVER = "caregiver"
TRIVIA_SOURCE_GENERATED = "generated"
TRIVIA_SOURCES = (TRIVIA_SOURCE_PRELOADED, TRIVIA_SOURCE_CAREGIVER, TRIVIA_SOURCE_GENERATED)
ACTIVITIES = (
    "family_matching", "name_recall", "event_recall", "routine_recall",
    "picture_matching", "memory_quiz", "trivia_prompt",
)
OUTCOMES = ("completed", "correct", "incorrect", "skipped", "stopped")

# assistant
INPUT_MODES = ("text", "voice")
ANSWER_MODES = ("template", "llm", "fallback", "no_data")
INTENTS = ("who_is", "next_event", "medication", "general")

# settings keys
SETTING_KEYS = ("game_topics", "trivia_frequency_min", "quiet_hours", "game_difficulty")
