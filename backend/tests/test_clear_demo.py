# clear_demo / --clear: remove the demo rows and photos, keep real data
import json
import os
import re
import sqlite3
import subprocess
import sys

import pytest

from app import config
from app.constants import TRIVIA_PERSONAL
from app.database import seed as seed_module
from app.database.seed import CLEARED_TABLES, SEED_PHOTOS_DIR, clear_demo, seed
from tests.factories import (
    make_caregiver, make_medication, make_memory, make_person, make_place, make_schedule_item,
    make_trivia_question,
)

ID_TABLES = ("caregivers", "people", "places", "schedule_items", "medications", "medication_times",
             "memories", "trivia_questions")


@pytest.fixture
def seeded(db, monkeypatch):
    # fast stand-in for PBKDF2; real hashing is covered by test_seed.py
    monkeypatch.setattr(seed_module, "hash_pin", lambda pin: f"fake${pin}")
    seed(db)
    return db


def seed_counts():
    return {
        "patient": 1, "caregivers": len(seed_module.CAREGIVERS), "settings": len(seed_module.SETTINGS),
        "people": len(seed_module.PEOPLE), "places": len(seed_module.PLACES),
        "schedule_items": len(seed_module.SCHEDULE_ITEMS), "medications": len(seed_module.MEDICATIONS),
        "medication_times": len(seed_module.MEDICATION_TIMES), "memories": len(seed_module.MEMORIES),
        "trivia_questions": len(seed_module.TRIVIA_QUESTIONS), "medication_logs": 0, "schedule_acks": 0,
    }


def seed_rows(db):
    return sum(
        db.execute(f"SELECT COUNT(*) FROM {table} WHERE id LIKE 'seed-%'").fetchone()[0] for table in ID_TABLES
    )


def seed_photos():
    return sorted(path.name for path in config.PHOTO_DIR.glob("seed-*.png"))


def add_real_data(db):
    caregiver = make_caregiver(db, pin_hash="x")
    person = make_person(db, created_by=caregiver["id"])
    place = make_place(db)
    memory = make_memory(db, verified_by=caregiver["id"], person_id=person["id"], place_id=place["id"])
    rows = {
        "caregivers": caregiver, "people": person, "places": place, "memories": memory,
        "schedule_items": make_schedule_item(db, person_id=person["id"]),
        "medications": make_medication(db, created_by=caregiver["id"]),
        "trivia_questions": make_trivia_question(db, kind=TRIVIA_PERSONAL, memory_id=memory["id"]),
    }
    # a real memory may point at a demo person; ON DELETE SET NULL keeps it
    rows["linked"] = make_memory(db, verified_by=caregiver["id"], person_id="seed-person-ana")
    return rows


def test_clear_removes_only_demo_rows_and_photos(seeded):
    real = add_real_data(seeded)
    config.PHOTO_DIR.joinpath("real.png").write_bytes(b"real photo")
    assert len(seed_photos()) == len(list(SEED_PHOTOS_DIR.glob("*.png")))

    assert clear_demo(seeded) == seed_counts()
    assert seed_rows(seeded) == 0
    assert seed_photos() == []
    assert config.PHOTO_DIR.joinpath("real.png").read_bytes() == b"real photo"
    for table in ("patient", "settings"):
        assert seeded.execute(f"SELECT COUNT(*) FROM {table}").fetchone()[0] == 0

    for table, row in real.items():
        table = "memories" if table == "linked" else table
        assert seeded.execute(f"SELECT 1 FROM {table} WHERE id = ?", (row["id"],)).fetchone(), table
    assert seeded.execute("SELECT COUNT(*) FROM medication_times").fetchone()[0] == 1
    linked = seeded.execute("SELECT person_id FROM memories WHERE id = ?", (real["linked"]["id"],)).fetchone()
    assert linked[0] is None
    # the keyword index only holds the real memories now
    assert seeded.execute("SELECT COUNT(*) FROM memories_fts").fetchone()[0] == 2


def test_edited_patient_and_setting_are_kept(seeded):
    seeded.execute("UPDATE patient SET preferred_name = 'Nanay' WHERE id = 1")
    seeded.execute("UPDATE settings SET value = ? WHERE key = 'game_difficulty'", (json.dumps(2),))
    removed = clear_demo(seeded)
    assert (removed["patient"], removed["settings"]) == (0, len(seed_module.SETTINGS) - 1)
    assert seeded.execute("SELECT preferred_name FROM patient").fetchone()[0] == "Nanay"
    assert [tuple(row) for row in seeded.execute("SELECT key, value FROM settings")] == [("game_difficulty", "2")]


def test_real_row_pointing_at_a_demo_caregiver_blocks_everything(seeded):
    make_person(seeded, created_by="seed-cg-ana")
    before, photos = list(seeded.iterdump()), seed_photos()
    with pytest.raises(sqlite3.IntegrityError, match=r"people\.created_by -> caregivers \(1 row\)"):
        clear_demo(seeded)
    assert list(seeded.iterdump()) == before
    assert seed_photos() == photos


def test_demo_logs_go_with_their_demo_rows(seeded):
    seeded.execute("INSERT INTO medication_logs (id, medication_id, due_at) "
                   "VALUES ('log-1', 'seed-med-losartan', '2026-10-01 20:00:00')")
    assert clear_demo(seeded)["medication_logs"] == 1


def test_replaced_photo_is_kept(seeded):
    config.PHOTO_DIR.joinpath("seed-ana.png").write_bytes(b"caregiver's own photo")
    clear_demo(seeded)
    assert seed_photos() == ["seed-ana.png"]


def test_clearing_twice_removes_nothing(seeded):
    clear_demo(seeded)
    assert set(clear_demo(seeded).values()) == {0}


def test_seeding_after_clearing_restores_everything(seeded):
    clear_demo(seeded)
    added = seed(seeded)
    assert added == {table: count for table, count in seed_counts().items() if table in added}
    assert len(seed_photos()) == len(list(SEED_PHOTOS_DIR.glob("*.png")))


def test_command_line_clear_prints_one_line_per_table(tmp_path):
    # absolute temp paths so the subprocess never touches backend/storage/
    db_path = (tmp_path / "cli" / "echovault.db").resolve()
    photo_dir = (tmp_path / "cli" / "photos").resolve()
    real_db = config.BACKEND_DIR / "storage" / "echovault.db"
    before = real_db.stat().st_mtime_ns if real_db.exists() else None
    env = {**os.environ, "DB_PATH": str(db_path), "PHOTO_DIR": str(photo_dir), "DEMO_MODE": "false"}

    def run(*args):
        result = subprocess.run([sys.executable, "-m", "app.database.seed", *args], cwd=config.BACKEND_DIR,
                                env=env, capture_output=True, text=True, timeout=120)
        assert result.returncode == 0, result.stderr
        return result.stdout.strip().splitlines()

    run()
    lines = run("--clear")
    parsed = [re.fullmatch(r"(\w+): (\d+) removed", line) for line in lines]
    assert all(parsed), lines
    assert [match.group(1) for match in parsed] == list(CLEARED_TABLES)
    assert {match.group(1): int(match.group(2)) for match in parsed} == seed_counts()
    assert list(photo_dir.glob("seed-*.png")) == []

    after = real_db.stat().st_mtime_ns if real_db.exists() else None
    assert after == before
