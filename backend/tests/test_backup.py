"""BKP-1 export and BKP-2 import tests.

All tests use the file-based fixtures (backup_env / file_client) which point
config.DB_PATH and config.PHOTO_DIR at a temp dir — real storage/ is never
touched. Export/import operate on those files on disk.
"""

import datetime
import io
import os
import re
import sqlite3
import zipfile

from app import config
from app.database import connection, seed


# ─────────────────────────── small helpers ───────────────────────────


def _manila_today():
    """Today's date in Asia/Manila (UTC+8), matching the router's date source."""
    now_utc = datetime.datetime.now(datetime.timezone.utc)
    manila = now_utc + datetime.timedelta(hours=8)
    return manila.strftime("%Y-%m-%d")


def _open_db(path):
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    return conn


def _snapshot_records():
    """Capture a comparable snapshot of the current hub's records on disk."""
    conn = _open_db(config.DB_PATH)
    try:
        prow = conn.execute("SELECT * FROM patient WHERE id = 1").fetchone()
        patient = dict(prow) if prow is not None else {}
        caregivers = sorted(r["id"] for r in conn.execute("SELECT id FROM caregivers"))
        memories = sorted(r["id"] for r in conn.execute("SELECT id FROM memories"))
        settings = {
            r["key"]: r["value"]
            for r in conn.execute("SELECT key, value FROM settings")
        }
    finally:
        conn.close()
    return {
        "patient": patient,
        "caregivers": caregivers,
        "memories": memories,
        "settings": settings,
    }


def _wipe_to_empty_hub():
    """Delete the live DB + photos and recreate an empty migrated hub.

    A replacement hub still needs an admin caregiver to authenticate the
    restore (the admin gate reads the live DB), so this seeds only that one
    admin row — mirroring how a fresh hub is provisioned before a restore. All
    other records (memories, settings, patient, photos) start empty.
    """
    if os.path.exists(config.DB_PATH):
        os.remove(config.DB_PATH)
    for name in os.listdir(config.PHOTO_DIR):
        os.remove(os.path.join(config.PHOTO_DIR, name))
    conn = connection.connect(config.DB_PATH)
    try:
        connection.migrate(conn)
        conn.execute(
            "INSERT INTO caregivers (id, name, access_level, pin_hash, is_active) "
            "VALUES (?, ?, 'admin', ?, 1)",
            (seed.CAREGIVER_ID, "Ana Santos", seed.hash_pin(seed.DEMO_PIN)),
        )
        conn.commit()
    finally:
        conn.close()


# ─────────────────────────── BKP-1 export ───────────────────────────


def test_export_returns_zip_with_db_and_photos_and_dated_name(
    file_client, caregiver_headers, backup_env
):
    resp = file_client.get("/backup/export", headers=caregiver_headers)
    assert resp.status_code == 200
    assert resp.headers["content-type"] == "application/zip"

    disposition = resp.headers["content-disposition"]
    m = re.search(r'filename="(echovault-backup-\d{4}-\d{2}-\d{2}\.zip)"', disposition)
    assert m, "unexpected Content-Disposition: %r" % disposition
    assert m.group(1) == "echovault-backup-{}.zip".format(_manila_today())

    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        names = zf.namelist()
    assert "echovault.db" in names
    assert any(n.startswith("photos/") for n in names)
    for photo in backup_env["photo_names"]:
        assert "photos/{}".format(photo) in names


def test_export_consistency_db_opens_with_seeded_rows(
    file_client, caregiver_headers, tmp_path
):
    resp = file_client.get("/backup/export", headers=caregiver_headers)
    assert resp.status_code == 200

    out_db = tmp_path / "exported.db"
    with zipfile.ZipFile(io.BytesIO(resp.content)) as zf:
        out_db.write_bytes(zf.read("echovault.db"))

    conn = _open_db(str(out_db))
    try:
        assert conn.execute("SELECT id FROM patient WHERE id = 1").fetchone()["id"] == 1
        ids = {r["id"] for r in conn.execute("SELECT id FROM caregivers")}
        assert "caregiver-demo-1" in ids
        assert conn.execute("SELECT COUNT(*) FROM memories").fetchone()[0] > 0
        keys = {r["key"] for r in conn.execute("SELECT key FROM settings")}
        assert keys >= {
            "game_topics",
            "game_difficulty",
            "trivia_frequency_min",
            "quiet_hours",
        }
    finally:
        conn.close()


def test_patient_cannot_export(file_client, patient_headers):
    resp = file_client.get("/backup/export", headers=patient_headers)
    assert resp.status_code == 403


# ─────────────────────────── BKP-2 import ───────────────────────────


def test_import_round_trip(file_client, caregiver_headers, backup_env):
    # Capture the seeded hub, then export it.
    before = _snapshot_records()
    before_photos = sorted(backup_env["photo_names"])

    resp = file_client.get("/backup/export", headers=caregiver_headers)
    assert resp.status_code == 200
    bundle = resp.content

    # Wipe to an empty migrated hub.
    _wipe_to_empty_hub()
    empty = _snapshot_records()
    assert empty["memories"] == []  # confirm the wipe actually happened
    assert empty["patient"] == {}

    # Import as admin with confirmation.
    imp = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("backup.zip", bundle, "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 200, imp.text

    # Records reproduced.
    after = _snapshot_records()
    assert after["patient"] == before["patient"]
    assert after["caregivers"] == before["caregivers"]
    assert after["memories"] == before["memories"]
    assert after["settings"] == before["settings"]

    # Photos reproduced.
    after_photos = sorted(os.listdir(config.PHOTO_DIR))
    assert after_photos == before_photos


def test_import_requires_confirmation(file_client, caregiver_headers):
    resp = file_client.get("/backup/export", headers=caregiver_headers)
    bundle = resp.content

    before = _snapshot_records()
    imp = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("backup.zip", bundle, "application/zip")},
        data={"confirm": "false"},
    )
    assert imp.status_code == 400
    # Current data untouched.
    assert _snapshot_records() == before


def test_import_rejects_non_zip(file_client, caregiver_headers):
    before = _snapshot_records()
    imp = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("notazip.zip", b"this is not a zip", "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 400
    assert _snapshot_records() == before


def test_import_rejects_zip_without_valid_db(file_client, caregiver_headers):
    before = _snapshot_records()

    # A readable zip, but no echovault.db inside.
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as zf:
        zf.writestr("readme.txt", "nope")
    imp = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("backup.zip", buf.getvalue(), "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 400

    # A zip with an echovault.db that is not a valid EchoVault DB.
    buf2 = io.BytesIO()
    with zipfile.ZipFile(buf2, "w") as zf:
        zf.writestr("echovault.db", "not a sqlite file")
    imp2 = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("backup.zip", buf2.getvalue(), "application/zip")},
        data={"confirm": "true"},
    )
    assert imp2.status_code == 400

    # Current data intact after both rejects.
    assert _snapshot_records() == before


def test_non_admin_caregiver_cannot_import(file_client, editor_headers, caregiver_headers):
    bundle = file_client.get("/backup/export", headers=caregiver_headers).content
    imp = file_client.post(
        "/backup/import",
        headers=editor_headers,
        files={"file": ("backup.zip", bundle, "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 403


def test_patient_cannot_import(file_client, patient_headers, caregiver_headers):
    bundle = file_client.get("/backup/export", headers=caregiver_headers).content
    imp = file_client.post(
        "/backup/import",
        headers=patient_headers,
        files={"file": ("backup.zip", bundle, "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 403


def test_no_restart_after_import(file_client, caregiver_headers):
    # Export the current (seeded) hub as the bundle to restore later.
    bundle = file_client.get("/backup/export", headers=caregiver_headers).content

    # Mutate a settings value live, through the SAME client.
    put = file_client.put(
        "/settings",
        headers=caregiver_headers,
        json={"game_difficulty": 3},
    )
    assert put.status_code == 200
    assert file_client.get("/settings", headers=caregiver_headers).json()[
        "game_difficulty"
    ] == 3

    # Import the original bundle (game_difficulty back to the seeded default 1).
    imp = file_client.post(
        "/backup/import",
        headers=caregiver_headers,
        files={"file": ("backup.zip", bundle, "application/zip")},
        data={"confirm": "true"},
    )
    assert imp.status_code == 200, imp.text

    # SAME running client reflects the restored data with no restart.
    restored = file_client.get("/settings", headers=caregiver_headers).json()
    assert restored["game_difficulty"] == 1


def test_bak_rollback_on_mid_swap_failure(file_client, caregiver_headers):
    bundle = file_client.get("/backup/export", headers=caregiver_headers).content
    before = _snapshot_records()

    # Force migrate() to raise mid-swap (after the live DB has been moved aside).
    # Restore manually (not monkeypatch.undo) so the config path patches set by
    # the shared backup_env fixture stay in effect for the post-failure checks.
    def _boom(conn):
        raise RuntimeError("simulated mid-swap failure")

    original_migrate = connection.migrate
    connection.migrate = _boom
    try:
        imp = file_client.post(
            "/backup/import",
            headers=caregiver_headers,
            files={"file": ("backup.zip", bundle, "application/zip")},
            data={"confirm": "true"},
        )
        assert imp.status_code == 500
    finally:
        connection.migrate = original_migrate

    # Original restored from .bak and still served by the SAME client.
    assert _snapshot_records() == before
    assert file_client.get("/settings", headers=caregiver_headers).status_code == 200

    # No dangling sidecars left behind.
    assert not os.path.exists(config.DB_PATH + ".bak")
    assert not os.path.exists(config.PHOTO_DIR + ".bak")
