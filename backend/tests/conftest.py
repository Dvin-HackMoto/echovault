# Every test runs against its own empty storage folder; nothing touches backend/storage/.
import copy
from datetime import datetime

import pytest
from fastapi.testclient import TestClient
from hypothesis import settings

from app import config
from app.constants import ACCESS_ADMIN, ROLE_CAREGIVER, ROLE_PATIENT
from app.database.connection import connect, migrate
from tests import demo_data, factories
from tests.factories import make_caregiver
from tests.fixtures import records as _records

# Shared property-test profile: 100 examples, no per-example deadline.
settings.register_profile("hub", max_examples=100, deadline=None)
settings.load_profile("hub")


@pytest.fixture(autouse=True)
def storage(tmp_path, monkeypatch):
    monkeypatch.setattr(config, "DB_PATH", tmp_path / "storage" / "echovault.db")
    monkeypatch.setattr(config, "PHOTO_DIR", tmp_path / "storage" / "photos")
    monkeypatch.setattr(config, "DEMO_MODE", False)
    return tmp_path / "storage"


@pytest.fixture
def db():
    migrate()
    conn = connect()
    yield conn
    conn.close()


@pytest.fixture
def client():
    from app.main import create_app

    with TestClient(create_app()) as test_client:
        yield test_client


@pytest.fixture
def caregiver(db):
    """An active admin caregiver (PIN 0000) in the test database."""
    return make_caregiver(db, name="Test Admin", access_level=ACCESS_ADMIN)


@pytest.fixture
def caregiver_client_headers(caregiver):
    """Headers that pass require_caregiver as the `caregiver` fixture."""
    return factories.caregiver_headers(caregiver)


# ───────── settings, dashboard and backup tests: a database with demo_data rows ─────────


@pytest.fixture
def demo_rows():
    """Puts the demo_data rows in the test database. Holds no connection afterwards,
    because backup import replaces the database file and Windows refuses while it is open."""
    migrate()
    conn = connect()
    try:
        demo_data.seed(conn)
    finally:
        conn.close()


@pytest.fixture
def db_conn(demo_rows, db):
    """An open connection to the database with the demo_data rows in it."""
    return db


# The header fixtures bring the demo_data rows with them: the tests that use them
# expect the caregivers, patient and dashboard rows to exist.


@pytest.fixture
def patient_headers(demo_rows):
    return {"X-Role": ROLE_PATIENT}


@pytest.fixture
def caregiver_headers(demo_rows):
    """Headers for the demo_data admin caregiver."""
    return {"X-Role": ROLE_CAREGIVER, "X-Caregiver-Id": demo_data.CAREGIVER_ID}


@pytest.fixture
def editor_headers(demo_rows):
    """Headers for the demo_data non-admin (editor) caregiver."""
    return {"X-Role": ROLE_CAREGIVER, "X-Caregiver-Id": demo_data.EDITOR_CAREGIVER_ID}


@pytest.fixture
def backup_env(demo_rows):
    """The demo_data database plus two photo files, all in this test's storage folder."""
    config.PHOTO_DIR.mkdir(parents=True, exist_ok=True)
    photo_names = ["ana.jpg", "home.png"]
    for name in photo_names:
        (config.PHOTO_DIR / name).write_bytes(b"fake-image-bytes-" + name.encode())
    return {"db_path": str(config.DB_PATH), "photo_dir": str(config.PHOTO_DIR), "photo_names": photo_names}


@pytest.fixture
def file_client(backup_env, client):
    """The client, once the backup_env files exist. get_db opens the database file on
    every request, so a later request in the same client sees an imported backup."""
    return client


# ─────────────────────── AI services: record fixtures ───────────────────────


def fresh(value):
    """Return a deep copy of fixture data so a test cannot mutate shared dicts."""
    return copy.deepcopy(value)


@pytest.fixture
def reference_now() -> datetime:
    return _records.REFERENCE_NOW


@pytest.fixture
def patient() -> dict:
    return fresh(_records.PATIENT)


@pytest.fixture
def caregiver_record() -> dict:
    """Ana, the patient's daughter and caregiver, as an AI record."""
    return fresh(_records.ANA)


@pytest.fixture
def all_records() -> list[dict]:
    """Every person and memory fixture in mixed order (fresh copies)."""
    return fresh(_records.ALL_RECORDS)


@pytest.fixture
def usable_records_expected() -> list[dict]:
    """Records the filter should keep at REFERENCE_NOW, in ALL_RECORDS order."""
    return fresh(_records.USABLE_RECORDS)


@pytest.fixture
def dropped_records() -> list[dict]:
    return fresh(_records.DROPPED_RECORDS)


@pytest.fixture
def dropped_markers() -> dict[str, str]:
    """Record id -> unique marker word for every record the filter must drop."""
    return dict(_records.DROPPED_MARKERS)
