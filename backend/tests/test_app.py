# HUB-3: app shell
import ipaddress
import socket

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app import config
from app.database.connection import connect
from app.main import create_app, lan_ip, register_feature_routers

FAKE_ROUTER = """
from fastapi import APIRouter

router = APIRouter(prefix="/alpha")


@router.get("")
def alpha():
    return {"feature": "alpha"}
"""


def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_startup_creates_storage_and_database(storage):
    assert not storage.exists()
    with TestClient(create_app()):
        assert config.PHOTO_DIR.is_dir()
        assert config.DB_PATH.is_file()
        conn = connect()
        assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] == 0
        conn.close()


def test_startup_does_not_seed_unless_demo_mode(client):
    conn = connect()
    assert conn.execute("SELECT COUNT(*) FROM patient").fetchone()[0] == 0
    conn.close()


def test_demo_mode_seeds_on_startup(monkeypatch):
    monkeypatch.setattr(config, "DEMO_MODE", True)
    with TestClient(create_app()) as client:
        conn = connect()
        assert conn.execute("SELECT preferred_name FROM patient").fetchone()[0] == "Lola Nena"
        conn.close()
        assert client.get("/photos/seed-ana.png").status_code == 200


def test_startup_runs_ai_startup_after_migrate(monkeypatch):
    # ARCHITECTURE "Hub Startup": migrate, (seed), load Whisper + warm up Ollama, then ready.
    calls = []
    monkeypatch.setattr("app.main.migrate", lambda: calls.append("migrate"))
    monkeypatch.setattr("app.main.ai_startup", lambda: calls.append("ai"))
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200
    assert calls == ["migrate", "ai"]


def test_ai_startup_failures_do_not_stop_the_hub(monkeypatch):
    # The real app.ai.startup(), with Whisper and Ollama both unavailable.
    from app.ai import llm, stt, startup

    def no_whisper(name):
        raise RuntimeError("no whisper model")

    monkeypatch.setattr(stt, "_create_model", no_whisper)
    monkeypatch.setattr(llm, "warm_up", lambda: False)
    monkeypatch.setattr("app.main.ai_startup", startup)
    stt._reset_for_tests()
    try:
        with TestClient(create_app()) as client:
            assert client.get("/health").status_code == 200
    finally:
        stt._reset_for_tests()


def test_photos_are_served(client):
    (config.PHOTO_DIR / "ana.png").write_bytes(b"not-really-a-png")
    response = client.get("/photos/ana.png")
    assert response.status_code == 200
    assert response.content == b"not-really-a-png"
    assert client.get("/photos/missing.png").status_code == 404


def test_cors_allows_the_phones(client):
    response = client.get("/health", headers={"Origin": "http://192.168.1.20:8081"})
    assert response.headers["access-control-allow-origin"] == "*"


def test_startup_prints_the_lan_address(capsys):
    with TestClient(create_app()):
        pass
    assert f"http://{lan_ip()}:8000" in capsys.readouterr().out


def test_lan_ip_is_an_address():
    ipaddress.ip_address(lan_ip())


def test_feature_routers_are_discovered(tmp_path, monkeypatch):
    features = tmp_path / "fakefeatures"
    for name, body in {"alpha": FAKE_ROUTER, "beta": "# placeholder, no router yet\n"}.items():
        (features / name).mkdir(parents=True)
        (features / name / "router.py").write_text(body, encoding="utf-8")
    (features / "gamma").mkdir()
    monkeypatch.syspath_prepend(str(tmp_path))

    app = FastAPI()
    assert register_feature_routers(app, features, "fakefeatures") == ["alpha"]
    assert TestClient(app).get("/alpha").json() == {"feature": "alpha"}


def test_placeholder_feature_routers_do_not_break_startup():
    # the real features/ folder, whatever state teammates' routers are in
    assert isinstance(register_feature_routers(FastAPI()), list)


def test_startup_keeps_existing_files(storage):
    config.PHOTO_DIR.mkdir(parents=True)
    (storage / "notes.txt").write_text("keep me", encoding="utf-8")
    (config.PHOTO_DIR / "ana.png").write_bytes(b"ana-bytes")
    with TestClient(create_app()):
        pass
    assert (storage / "notes.txt").read_text(encoding="utf-8") == "keep me"
    assert (config.PHOTO_DIR / "ana.png").read_bytes() == b"ana-bytes"


def test_lan_ip_falls_back_to_localhost(monkeypatch):
    def no_network(*args, **kwargs):
        raise OSError("no usable interface")

    monkeypatch.setattr(socket, "socket", no_network)
    monkeypatch.setattr(socket, "gethostbyname", no_network)
    assert lan_ip() == "127.0.0.1"


def _fail(*args, **kwargs):
    raise RuntimeError("boom")


def _block_mkdir(monkeypatch, storage):
    # a regular file where the storage folder should be makes mkdir fail
    storage.write_text("not a folder", encoding="utf-8")


@pytest.mark.parametrize(
    "step, break_it",
    [
        ("create storage folders", _block_mkdir),
        ("migrate database", lambda mp, _: mp.setattr("app.main.migrate", _fail)),
        (
            "seed demo data",
            lambda mp, _: (mp.setattr(config, "DEMO_MODE", True), mp.setattr("app.main.seed", _fail)),
        ),
    ],
)
def test_startup_failure_names_the_step(step, break_it, monkeypatch, storage, capsys):
    break_it(monkeypatch, storage)
    with pytest.raises(Exception):
        with TestClient(create_app()):
            pass
    assert f"EchoVault hub failed to start: {step}:" in capsys.readouterr().err


def test_cors_preflight_is_permissive(client):
    response = client.options(
        "/health",
        headers={
            "Origin": "http://10.0.0.7:19000",
            "Access-Control-Request-Method": "PATCH",
            "Access-Control-Request-Headers": "X-Role, X-Something-Else",
        },
    )
    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "*"
    assert "PATCH" in response.headers["access-control-allow-methods"]
    allowed = response.headers["access-control-allow-headers"].lower()
    assert "x-role" in allowed and "x-something-else" in allowed


def test_png_photo_has_png_content_type(client):
    (config.PHOTO_DIR / "ana.png").write_bytes(b"png-bytes")
    response = client.get("/photos/ana.png")
    assert response.headers["content-type"].startswith("image/png")


@pytest.mark.parametrize(
    "path",
    [
        "/photos/%2e%2e/secret.txt",
        "/photos/..%2fsecret.txt",
        "/photos/%2e%2e%2fsecret.txt",
        "/photos/%252e%252e%252fsecret.txt",
    ],
)
def test_photo_traversal_is_rejected(client, storage, path):
    (storage / "secret.txt").write_text("top-secret", encoding="utf-8")
    response = client.get(path)
    assert response.status_code == 404
    assert b"top-secret" not in response.content


def test_router_import_error_propagates(tmp_path, monkeypatch):
    features = tmp_path / "brokenfeatures"
    (features / "alpha").mkdir(parents=True)
    (features / "alpha" / "router.py").write_text('raise RuntimeError("router exploded")\n', encoding="utf-8")
    monkeypatch.syspath_prepend(str(tmp_path))
    with pytest.raises(RuntimeError, match="router exploded"):
        register_feature_routers(FastAPI(), features, "brokenfeatures")


def test_empty_features_folder_registers_nothing(tmp_path, monkeypatch):
    features = tmp_path / "emptyfeatures"
    features.mkdir()
    monkeypatch.syspath_prepend(str(tmp_path))
    app = create_app()
    assert register_feature_routers(app, features, "emptyfeatures") == []
    with TestClient(app) as client:
        assert client.get("/health").json() == {"status": "ok"}
        (config.PHOTO_DIR / "ana.png").write_bytes(b"ana")
        assert client.get("/photos/ana.png").status_code == 200
