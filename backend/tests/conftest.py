# Every test runs against its own empty storage folder; nothing touches backend/storage/.
import pytest
from fastapi.testclient import TestClient
from hypothesis import settings

from app import config
from app.constants import ACCESS_ADMIN
from app.database.connection import connect, migrate
from tests.factories import caregiver_headers, make_caregiver

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
    return caregiver_headers(caregiver)
