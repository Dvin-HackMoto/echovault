# HUB-5: demo seed data
import json
import os
import re
import subprocess
import sys

import pytest

from app import config, constants
from app.database import seed as seed_module
from app.database.seed import DEMO_PINS, seed
from app.features.auth.service import check_pin, hash_pin

SEEDED_TABLES = ("patient", "caregivers", "settings", "people", "places", "schedule_items",
                 "medications", "medication_times", "memories", "trivia_questions")

# the core retrieval query from ARCHITECTURE.md
RETRIEVE = """
SELECT m.* FROM memories_fts f
JOIN memories m ON m.rowid = f.rowid
WHERE memories_fts MATCH :q
  AND m.trust = 'verified'
  AND m.validity != 'archived'
  AND (m.valid_until IS NULL OR m.valid_until >= datetime('now','localtime'))
  AND (m.valid_from  IS NULL OR m.valid_from  <= datetime('now','localtime'))
ORDER BY CASE m.importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, rank
LIMIT 5;
"""


def counts(conn):
    return {table: conn.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] for table in SEEDED_TABLES}


def scalar(conn, sql, *args):
    return conn.execute(sql, args).fetchone()[0]


@pytest.fixture
def seeded(db):
    seed(db)
    return db


def test_seed_fills_every_table(seeded):
    assert counts(seeded) == {
        "patient": 1, "caregivers": 2, "settings": 4, "people": 8, "places": 4, "schedule_items": 12,
        "medications": 3, "medication_times": 3, "memories": 21, "trivia_questions": 3,
    }


def test_seed_twice_adds_nothing(seeded):
    before = counts(seeded)
    again = seed(seeded)
    assert set(again.values()) == {0}
    assert counts(seeded) == before
    assert scalar(seeded, "SELECT COUNT(*) FROM memories_fts") == before["memories"]


def test_seed_does_not_overwrite_caregiver_edits(seeded):
    seeded.execute("UPDATE memories SET content = 'Ana loves orchids.' WHERE id = 'seed-mem-ana-flower'")
    seeded.execute("DELETE FROM memories WHERE id = 'seed-mem-paolo-school-b'")
    seeded.execute("UPDATE memories SET trust = 'verified' WHERE id = 'seed-mem-paolo-school-a'")
    seeded.execute("UPDATE caregivers SET pin_hash = ? WHERE id = 'seed-cg-ana'", (hash_pin("9999"),))
    seed(seeded)
    assert scalar(seeded, "SELECT content FROM memories WHERE id = 'seed-mem-ana-flower'") == "Ana loves orchids."
    assert scalar(seeded, "SELECT trust FROM memories WHERE id = 'seed-mem-paolo-school-a'") == "verified"
    assert check_pin("9999", scalar(seeded, "SELECT pin_hash FROM caregivers WHERE id = 'seed-cg-ana'"))


def test_seed_is_all_or_nothing(db, monkeypatch):
    broken = dict(seed_module.MEMORIES[0], id="seed-mem-broken", category="not_a_category")
    monkeypatch.setattr(seed_module, "MEMORIES", [*seed_module.MEMORIES, broken])
    with pytest.raises(Exception):
        seed(db)
    assert set(counts(db).values()) == {0}


def test_seeded_values_are_known_constants(seeded):
    assert scalar(seeded, "SELECT language FROM patient") in constants.LANGUAGES
    assert {row["key"] for row in seeded.execute("SELECT key FROM settings")} == set(constants.SETTING_KEYS)
    categories = {row[0] for row in seeded.execute("SELECT DISTINCT category FROM memories")}
    assert categories <= set(constants.CATEGORIES)


def test_demo_pins_verify_and_are_not_stored(seeded):
    rows = seeded.execute("SELECT id, pin_hash FROM caregivers").fetchall()
    assert {row["id"] for row in rows} == set(DEMO_PINS)
    for row in rows:
        assert check_pin(DEMO_PINS[row["id"]], row["pin_hash"])
        assert not check_pin("0000", row["pin_hash"])
        assert DEMO_PINS[row["id"]] not in row["pin_hash"].split("$")
    assert rows[0]["pin_hash"] != rows[1]["pin_hash"]


def test_same_pin_gets_a_different_hash_each_time():
    first, second = hash_pin("1234"), hash_pin("1234")
    assert first != second
    assert check_pin("1234", first) and check_pin("1234", second)
    assert not check_pin("1234", "not-a-hash")


def test_exactly_one_fallback_caregiver_person(seeded):
    rows = seeded.execute("SELECT name, trust FROM people WHERE is_caregiver = 1").fetchall()
    assert [(row["name"], row["trust"]) for row in rows] == [("Ana Santos-Reyes", "verified")]


def test_dashboard_cases_are_present(seeded):
    trust = {row[0]: row[1] for row in seeded.execute("SELECT trust, COUNT(*) FROM memories GROUP BY trust")}
    assert trust == {"verified": 16, "unverified": 2, "conflicting": 2, "outdated": 1}

    pair = seeded.execute("SELECT id, conflicts_with FROM memories WHERE trust = 'conflicting' ORDER BY id").fetchall()
    assert [(row["id"], row["conflicts_with"]) for row in pair] == [
        ("seed-mem-paolo-school-a", "seed-mem-paolo-school-b"),
        ("seed-mem-paolo-school-b", "seed-mem-paolo-school-a"),
    ]

    ai = seeded.execute("SELECT trust FROM memories WHERE source = 'ai_suggested'").fetchall()
    assert [row["trust"] for row in ai] == ["unverified"]
    assert scalar(seeded, "SELECT COUNT(*) FROM memories WHERE source = 'patient' AND trust = 'verified'") == 0
    assert scalar(seeded, "SELECT valid_until FROM memories WHERE trust = 'outdated'") < "2026-10-09"


def test_verified_memories_record_who_verified_them(seeded):
    mismatched = scalar(
        seeded,
        "SELECT COUNT(*) FROM memories "
        "WHERE (trust = 'verified') != (verified_by IS NOT NULL AND verified_at IS NOT NULL)",
    )
    assert mismatched == 0
    safety = seeded.execute("SELECT source, trust FROM memories WHERE category = 'care_safety'").fetchall()
    assert safety and all((row["source"], row["trust"]) == ("caregiver", "verified") for row in safety)


def test_every_photo_path_points_to_a_file(seeded):
    paths = [
        row[0]
        for table in ("patient", "people", "places", "memories", "medications")
        for row in seeded.execute(f"SELECT photo_path FROM {table} WHERE photo_path IS NOT NULL")
    ]
    assert len(paths) == 11
    for path in paths:
        assert (config.PHOTO_DIR / path).is_file()
        assert (config.PHOTO_DIR / path).read_bytes().startswith(b"\x89PNG")
    # every verified person has a photo for the directory and the matching games
    assert scalar(seeded, "SELECT COUNT(*) FROM people WHERE trust = 'verified' AND photo_path IS NULL") == 0


def test_settings_hold_the_architecture_seed_values(seeded):
    settings = {row["key"]: json.loads(row["value"]) for row in seeded.execute("SELECT key, value FROM settings")}
    assert settings == {
        "game_topics": ["family_names", "relationships", "routines"],
        "trivia_frequency_min": 120,
        "quiet_hours": {"start": "21:00", "end": "07:00"},
        "game_difficulty": 1,
    }


def test_schedule_and_medications_cover_the_demo(seeded):
    kinds = {row[0] for row in seeded.execute("SELECT DISTINCT kind FROM schedule_items")}
    assert kinds == set(constants.SCHEDULE_KINDS)
    recurrences = {row[0] for row in seeded.execute("SELECT DISTINCT recurrence FROM schedule_items")}
    assert recurrences == {None, "daily", "weekly:SU", "weekly:SA"}
    assert scalar(seeded, "SELECT COUNT(*) FROM schedule_items WHERE is_quiet_period = 1") >= 1

    losartan = seeded.execute(
        "SELECT m.name, m.dose, m.instructions, t.time_of_day, t.days FROM medications m "
        "JOIN medication_times t ON t.medication_id = m.id WHERE m.id = 'seed-med-losartan'"
    ).fetchone()
    assert tuple(losartan) == ("Losartan", "1 tablet", "after dinner", "20:00", "daily")
    # doses are never pre-confirmed; MED-2 generates the logs
    assert scalar(seeded, "SELECT COUNT(*) FROM medication_logs") == 0


def test_personal_trivia_links_to_verified_memories(seeded):
    rows = seeded.execute(
        "SELECT q.topic, q.choices, m.trust FROM trivia_questions q JOIN memories m ON m.id = q.memory_id"
    ).fetchall()
    assert len(rows) == 3
    topics = json.loads(scalar(seeded, "SELECT value FROM settings WHERE key = 'game_topics'"))
    for row in rows:
        assert row["trust"] == "verified"
        assert row["topic"] in topics
        assert row["choices"] is None or isinstance(json.loads(row["choices"]), list)


def test_core_retrieval_query_only_returns_trusted_memories(seeded):
    def retrieve(text):
        return [row["id"] for row in seeded.execute(RETRIEVE, {"q": text})]

    assert retrieve("sunflowers") == ["seed-mem-ana-flower"]
    assert retrieve("dizzy") == ["seed-mem-dizzy"]
    # critical and important memories come first
    assert retrieve("Ana")[0] == "seed-mem-dizzy"
    # conflicting, outdated and unverified rows never come back
    assert retrieve("engineering") == []
    assert retrieve("Cebu") == []
    assert retrieve("suman") == []


def test_patient_fields_are_filled_in(seeded):
    # Requirement 9.1
    rows = seeded.execute("SELECT full_name, preferred_name, birth_date, photo_path, language FROM patient").fetchall()
    assert len(rows) == 1
    patient = rows[0]
    for column in ("full_name", "preferred_name", "birth_date", "photo_path", "language"):
        assert isinstance(patient[column], str) and patient[column].strip()
    assert re.fullmatch(r"\d{4}-\d{2}-\d{2}", patient["birth_date"])


def test_readme_pin_table_matches_demo_pins():
    # Requirement 9.2: the README lists each caregiver's demo PIN next to their name
    readme = (config.BACKEND_DIR / "README.md").read_text(encoding="utf-8")
    table = {
        match.group(1).strip(): (match.group(2).strip(), match.group(3).strip())
        for match in re.finditer(r"^\|([^|]+)\|\s*(admin|editor)\s*\|\s*(\d{4,})\s*\|", readme, re.MULTILINE)
    }
    expected = {
        caregiver["name"]: (caregiver["access_level"], DEMO_PINS[caregiver["id"]])
        for caregiver in seed_module.CAREGIVERS
    }
    assert table == expected
    levels = {caregiver["access_level"] for caregiver in seed_module.CAREGIVERS}
    assert {constants.ACCESS_ADMIN, constants.ACCESS_EDITOR} <= levels


def test_seed_includes_a_non_family_person(seeded):
    # Requirement 9.3
    family = {"daughter", "son", "grandson", "granddaughter", "cousin", "husband", "wife", "sister", "brother"}
    relationships = {row[0] for row in seeded.execute("SELECT relationship FROM people")}
    assert relationships - family


def test_every_medication_has_valid_times(seeded):
    # Requirement 9.5
    meds = seeded.execute("SELECT id, name, dose FROM medications").fetchall()
    assert meds
    for med in meds:
        assert med["name"] and med["dose"]
        times = [row[0] for row in seeded.execute(
            "SELECT time_of_day FROM medication_times WHERE medication_id = ?", (med["id"],))]
        assert times, med["id"]
        for time in times:
            assert re.fullmatch(r"([01]\d|2[0-3]):[0-5]\d", time), time


def test_each_category_has_a_verified_memory_by_a_seeded_caregiver(seeded):
    # Requirement 9.6
    caregivers = {row[0] for row in seeded.execute("SELECT id FROM caregivers")}
    for category in ("identity", "routine", "history", "preference", "care_safety"):
        rows = seeded.execute(
            "SELECT verified_by, verified_at FROM memories WHERE category = ? AND trust = 'verified'", (category,)
        ).fetchall()
        assert rows, category
        for row in rows:
            assert row["verified_by"] in caregivers
            assert row["verified_at"]


def test_existing_photo_is_not_overwritten(db):
    # Requirement 9.10
    config.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    existing = config.PHOTO_DIR / "seed-ana.png"
    existing.write_bytes(b"caregiver's own photo")
    seed(db)
    assert existing.read_bytes() == b"caregiver's own photo"
    assert (config.PHOTO_DIR / "seed-bea.png").read_bytes().startswith(b"\x89PNG")


def test_reinserted_conflict_partner_does_not_relink_existing_row(seeded):
    # Requirement 10.7 (D4 regression): only link the pair when both rows are new in this run
    ids = [memory["id"] for memory in seed_module.MEMORIES]
    assert ids.index("seed-mem-paolo-school-a") < ids.index("seed-mem-paolo-school-b")

    seeded.execute("DELETE FROM memories WHERE id = 'seed-mem-paolo-school-b'")
    # ON DELETE SET NULL clears the surviving side
    assert scalar(seeded, "SELECT conflicts_with FROM memories WHERE id = 'seed-mem-paolo-school-a'") is None
    added = seed(seeded)
    assert added["memories"] == 1
    assert scalar(seeded, "SELECT conflicts_with FROM memories WHERE id = 'seed-mem-paolo-school-a'") is None
    assert scalar(seeded, "SELECT conflicts_with FROM memories WHERE id = 'seed-mem-paolo-school-b'") == \
        "seed-mem-paolo-school-a"


def test_command_line_seed_prints_one_line_per_table(tmp_path):
    # Requirement 10.5: absolute temp paths so the subprocess never touches backend/storage/
    db_path = (tmp_path / "cli" / "echovault.db").resolve()
    photo_dir = (tmp_path / "cli" / "photos").resolve()
    real_db = config.BACKEND_DIR / "storage" / "echovault.db"
    before = real_db.stat().st_mtime_ns if real_db.exists() else None

    env = {**os.environ, "DB_PATH": str(db_path), "PHOTO_DIR": str(photo_dir), "DEMO_MODE": "false"}
    result = subprocess.run(
        [sys.executable, "-m", "app.database.seed"], cwd=config.BACKEND_DIR, env=env,
        capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr

    lines = result.stdout.strip().splitlines()
    parsed = [re.fullmatch(r"(\w+): (\d+) added", line) for line in lines]
    assert all(parsed), lines
    printed = {match.group(1): int(match.group(2)) for match in parsed}
    assert len(printed) == len(lines)
    assert set(printed) == set(SEEDED_TABLES)
    assert printed["memories"] == len(seed_module.MEMORIES)
    assert printed["caregivers"] == len(seed_module.CAREGIVERS)

    assert db_path.is_file()
    assert (photo_dir / "seed-ana.png").is_file()
    after = real_db.stat().st_mtime_ns if real_db.exists() else None
    assert after == before
