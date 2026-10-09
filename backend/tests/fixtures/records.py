"""Seed-style demo records used by the AI services tests.

Every dict uses only column names from the ``patient``, ``people`` and
``memories`` tables in docs/ARCHITECTURE.md. Records that the shared filter
must drop at ``REFERENCE_NOW`` each carry a unique marker word (see
``DROPPED_MARKERS``) so tests can assert that text never leaks into a prompt
or fallback answer.

Treat these module-level objects as read-only. Tests should take copies via
the ``fresh`` helper / fixtures in ``tests/conftest.py``.

Import as ``from tests.fixtures.records import ...`` (``pytest.ini`` puts
``backend/`` on ``sys.path`` via ``pythonpath = .``).
"""

from datetime import datetime

# Naive Manila local time used as "now" for every fixture-based check.
REFERENCE_NOW = datetime(2025, 6, 15, 10, 0, 0)

# ── patient (single row) ────────────────────────────────────────────────────

PATIENT = {
    "id": 1,
    "full_name": "Elena Santos",
    "preferred_name": "Lola Nena",
    "language": "fil-en",
}

# ── people ──────────────────────────────────────────────────────────────────

ANA = {
    "id": "person-ana",
    "name": "Ana Santos",
    "nickname": "Ana",
    "relationship": "daughter",
    "notes": "Visits every Saturday.",
    "is_caregiver": 1,
    "trust": "verified",
}

MIGUEL = {
    "id": "person-miguel",
    "name": "Miguel Santos",
    "nickname": "Migs",
    "relationship": "grandson",
    "notes": "Studies in Manila.",
    "is_caregiver": 0,
    "trust": "verified",
}

CARLO_UNVERIFIED = {
    "id": "person-carlo",
    "name": "Carlo Reyes",
    "nickname": "Carlo",
    "relationship": "neighbor",
    "notes": "Says he is a cousin. ZEBRA-CARLO",
    "is_caregiver": 0,
    "trust": "unverified",
}

# ── memories ────────────────────────────────────────────────────────────────

MEM_VERIFIED_FLOWER = {
    "id": "mem-flower",
    "title": "Ana's favorite flower",
    "content": "Ana loves sunflowers.",
    "category": "preference",
    "importance": "general",
    "trust": "verified",
    "validity": "persistent",
    "valid_from": None,
    "valid_until": None,
    "person_id": "person-ana",
    "conflicts_with": None,
}

MEM_VERIFIED_CHURCH = {
    "id": "mem-church",
    "title": "Sunday mass",
    "content": "Every Sunday you go to the 9 AM mass at Malolos Church.",
    "category": "routine",
    "importance": "important",
    "trust": "verified",
    "validity": "persistent",
    "valid_from": None,
    "valid_until": None,
    "person_id": None,
    "conflicts_with": None,
}

MEM_UNVERIFIED = {
    "id": "mem-unverified",
    "title": "Old house",
    "content": "You once lived near the ZEBRA-UNVERIFIED market.",
    "category": "history",
    "importance": "general",
    "trust": "unverified",
    "validity": "persistent",
    "valid_from": None,
    "valid_until": None,
    "person_id": None,
    "conflicts_with": None,
}

MEM_CONFLICT_A = {
    "id": "mem-conflict-a",
    "title": "Wedding year",
    "content": "You married in 1965 at ZEBRA-CONFLICT-A chapel.",
    "category": "history",
    "importance": "general",
    "trust": "conflicting",
    "validity": "persistent",
    "valid_from": None,
    "valid_until": None,
    "person_id": None,
    "conflicts_with": "mem-conflict-b",
}

MEM_CONFLICT_B = {
    "id": "mem-conflict-b",
    "title": "Wedding year",
    "content": "You married in 1967 at ZEBRA-CONFLICT-B chapel.",
    "category": "history",
    "importance": "general",
    "trust": "conflicting",
    "validity": "persistent",
    "valid_from": None,
    "valid_until": None,
    "person_id": None,
    "conflicts_with": "mem-conflict-a",
}

MEM_ARCHIVED = {
    "id": "mem-archived",
    "title": "Old doctor",
    "content": "Your doctor was Dr. ZEBRA-ARCHIVED.",
    "category": "care_safety",
    "importance": "important",
    "trust": "verified",
    "validity": "archived",
    "valid_from": None,
    "valid_until": None,
    "person_id": None,
    "conflicts_with": None,
}

MEM_EXPIRED = {
    "id": "mem-expired",
    "title": "Visitor last month",
    "content": "Tita ZEBRA-EXPIRED is staying with you this week.",
    "category": "routine",
    "importance": "general",
    "trust": "verified",
    "validity": "temporary",
    "valid_from": "2025-05-25 00:00:00",
    "valid_until": "2025-06-01 00:00:00",
    "person_id": None,
    "conflicts_with": None,
}

MEM_NOT_YET = {
    "id": "mem-not-yet",
    "title": "Upcoming trip",
    "content": "You are going on a trip to ZEBRA-NOT-YET beach.",
    "category": "routine",
    "importance": "general",
    "trust": "verified",
    "validity": "scheduled",
    "valid_from": "2025-07-01 00:00:00",
    "valid_until": None,
    "person_id": None,
    "conflicts_with": None,
}

MEM_MISSING_KEYS = {
    "id": "mem-missing-keys",
    "content": "Your favorite snack is turon.",
    "trust": "verified",
}

# ── groupings ───────────────────────────────────────────────────────────────

# Records the filter keeps at REFERENCE_NOW, in ALL_RECORDS order.
USABLE_RECORDS = [MEM_VERIFIED_FLOWER, ANA, MEM_VERIFIED_CHURCH, MIGUEL, MEM_MISSING_KEYS]

# Records the filter drops at REFERENCE_NOW, mapped to their marker word.
DROPPED_MARKERS = {
    "person-carlo": "ZEBRA-CARLO",
    "mem-unverified": "ZEBRA-UNVERIFIED",
    "mem-conflict-a": "ZEBRA-CONFLICT-A",
    "mem-conflict-b": "ZEBRA-CONFLICT-B",
    "mem-archived": "ZEBRA-ARCHIVED",
    "mem-expired": "ZEBRA-EXPIRED",
    "mem-not-yet": "ZEBRA-NOT-YET",
}

DROPPED_RECORDS = [
    CARLO_UNVERIFIED,
    MEM_UNVERIFIED,
    MEM_CONFLICT_A,
    MEM_CONFLICT_B,
    MEM_ARCHIVED,
    MEM_EXPIRED,
    MEM_NOT_YET,
]

# Every person and memory fixture, usable and dropped interleaved.
# PATIENT is a profile row, not a Record, so it is not included.
ALL_RECORDS = [
    MEM_UNVERIFIED,
    MEM_VERIFIED_FLOWER,
    CARLO_UNVERIFIED,
    ANA,
    MEM_CONFLICT_A,
    MEM_EXPIRED,
    MEM_VERIFIED_CHURCH,
    MEM_CONFLICT_B,
    MIGUEL,
    MEM_ARCHIVED,
    MEM_MISSING_KEYS,
    MEM_NOT_YET,
]
