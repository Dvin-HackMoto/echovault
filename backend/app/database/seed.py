"""Idempotent demo seed.

Creates the minimal data Module 11 needs to be exercised end to end: one
patient, one active caregiver (with a salted PBKDF2 PIN hash — never plaintext),
the four settings rows, and the dashboard-demo rows (unverified AI suggestion,
a conflicting pair, an outdated memory, an unconfirmed + skipped medication log,
a flagged assistant answer, and a mix of played/skipped activity).

All inserts use fixed ids with INSERT OR IGNORE / existence checks, so running
seed() twice adds no duplicate rows. Every photo_path is NULL.
"""

import hashlib
import json
import os

from app.constants import SETTINGS_DEFAULTS

# Fixed demo ids so re-seeding is idempotent.
CAREGIVER_ID = "caregiver-demo-1"
# A non-admin (editor) caregiver so backup-import 403 tests have a real
# non-admin to exercise the admin gate against. Additive data only.
EDITOR_CAREGIVER_ID = "caregiver-demo-2"
DEMO_PIN = "1234"

# PBKDF2 parameters. Auth module owns real login; this is just so the seeded
# caregiver has a real salted hash rather than a plaintext PIN.
_PBKDF2_SALT = b"echovault-demo-salt"
_PBKDF2_ITERATIONS = 100_000


def hash_pin(pin):
    """Return a hex PBKDF2-HMAC-SHA256 hash of a PIN with a fixed demo salt."""
    digest = hashlib.pbkdf2_hmac(
        "sha256", pin.encode("utf-8"), _PBKDF2_SALT, _PBKDF2_ITERATIONS
    )
    return digest.hex()


def _exists(conn, table, where, params):
    row = conn.execute(
        "SELECT 1 FROM {} WHERE {} LIMIT 1".format(table, where), params
    ).fetchone()
    return row is not None


def seed(conn):
    """Insert minimal demo data. Idempotent."""
    # ─── patient (single row, id = 1) ───
    if not _exists(conn, "patient", "id = 1", ()):
        conn.execute(
            "INSERT INTO patient (id, full_name, preferred_name, language, "
            "font_scale, voice_enabled, managed_mode) "
            "VALUES (1, ?, ?, 'fil-en', 1.4, 1, 0)",
            ("Elena Reyes Santos", "Lola Nena"),
        )

    # ─── active caregiver with a salted PIN hash ───
    conn.execute(
        "INSERT OR IGNORE INTO caregivers (id, name, relationship, access_level, "
        "pin_hash, is_active) VALUES (?, ?, ?, 'admin', ?, 1)",
        (CAREGIVER_ID, "Ana Santos", "daughter", hash_pin(DEMO_PIN)),
    )

    # ─── a non-admin (editor) caregiver, for the import admin-gate tests ───
    conn.execute(
        "INSERT OR IGNORE INTO caregivers (id, name, relationship, access_level, "
        "pin_hash, is_active) VALUES (?, ?, ?, 'editor', ?, 1)",
        (EDITOR_CAREGIVER_ID, "Ben Santos", "son", hash_pin(DEMO_PIN)),
    )

    # ─── settings (four rows, JSON values) ───
    for key, value in SETTINGS_DEFAULTS.items():
        conn.execute(
            "INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)",
            (key, json.dumps(value)),
        )

    # ─── dashboard demo: unverified AI-suggested memory ───
    conn.execute(
        "INSERT OR IGNORE INTO memories (id, title, content, category, importance, "
        "trust, validity, source) VALUES "
        "('mem-ai-1', 'Possible favorite flower', 'Lola Nena may love sunflowers.', "
        "'preference', 'general', 'unverified', 'persistent', 'ai_suggested')",
        (),
    )

    # ─── dashboard demo: conflicting pair pointing at each other ───
    # Insert both first (conflicts_with NULL), then link, so FK order is safe.
    conn.execute(
        "INSERT OR IGNORE INTO memories (id, title, content, category, importance, "
        "trust, validity, source) VALUES "
        "('mem-conf-a', 'Breakfast time', 'Breakfast is at 7am.', 'routine', "
        "'important', 'conflicting', 'persistent', 'caregiver')",
        (),
    )
    conn.execute(
        "INSERT OR IGNORE INTO memories (id, title, content, category, importance, "
        "trust, validity, source) VALUES "
        "('mem-conf-b', 'Breakfast time', 'Breakfast is at 8am.', 'routine', "
        "'important', 'conflicting', 'persistent', 'patient')",
        (),
    )
    conn.execute(
        "UPDATE memories SET conflicts_with = 'mem-conf-b' "
        "WHERE id = 'mem-conf-a' AND conflicts_with IS NULL"
    )
    conn.execute(
        "UPDATE memories SET conflicts_with = 'mem-conf-a' "
        "WHERE id = 'mem-conf-b' AND conflicts_with IS NULL"
    )

    # ─── dashboard demo: outdated memory, recently updated ───
    conn.execute(
        "INSERT OR IGNORE INTO memories (id, title, content, category, importance, "
        "trust, validity, source, updated_at) VALUES "
        "('mem-outdated-1', 'Old address', 'Lives on Mabini St.', 'identity', "
        "'general', 'outdated', 'persistent', 'caregiver', "
        "datetime('now','localtime'))",
        (),
    )

    # ─── dashboard demo: medication with unconfirmed + skipped logs (due in past) ───
    conn.execute(
        "INSERT OR IGNORE INTO medications (id, name, dose, instructions, is_active, "
        "created_by) VALUES "
        "('med-1', 'Amlodipine', '1 tablet', 'after breakfast', 1, ?)",
        (CAREGIVER_ID,),
    )
    conn.execute(
        "INSERT OR IGNORE INTO medication_times (id, medication_id, time_of_day, days) "
        "VALUES ('medtime-1', 'med-1', '08:00', 'daily')",
        (),
    )
    conn.execute(
        "INSERT OR IGNORE INTO medication_logs (id, medication_id, due_at, status, "
        "confirmed_by) VALUES "
        "('medlog-unconfirmed-1', 'med-1', datetime('now','localtime','-2 hours'), "
        "'unconfirmed', 'none')",
        (),
    )
    conn.execute(
        "INSERT OR IGNORE INTO medication_logs (id, medication_id, due_at, status, "
        "confirmed_by, responded_at) VALUES "
        "('medlog-skipped-1', 'med-1', datetime('now','localtime','-1 day'), "
        "'skipped', 'patient', datetime('now','localtime','-1 day'))",
        (),
    )

    # ─── dashboard demo: flagged assistant answer ───
    conn.execute(
        "INSERT OR IGNORE INTO assistant_log (id, question, input_mode, intent, "
        "answer, answer_mode, flagged) VALUES "
        "('asst-flagged-1', 'Who is Ana?', 'text', 'who_is', "
        "'Ana is your neighbor.', 'llm', 1)",
        (),
    )

    # ─── dashboard demo: activity mixing played and skipped, across topics ───
    _activity = [
        ("act-1", "family_matching", "family_names", "completed", 1, 45),
        ("act-2", "name_recall", "relationships", "skipped", 1, 5),
        ("act-3", "trivia_prompt", "routines", "completed", 2, 30),
        ("act-4", "memory_quiz", "recent_events", "stopped", 2, 12),
    ]
    for aid, activity, topic, outcome, difficulty, duration in _activity:
        conn.execute(
            "INSERT OR IGNORE INTO activity_log (id, activity, topic, outcome, "
            "difficulty, duration_sec) VALUES (?, ?, ?, ?, ?, ?)",
            (aid, activity, topic, outcome, difficulty, duration),
        )

    conn.commit()
