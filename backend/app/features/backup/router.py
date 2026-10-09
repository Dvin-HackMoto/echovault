# GET /backup/export (zip: db + photos), POST /backup/import
#
# BKP-1 Export (caregiver-only) and BKP-2 Import (admin-only). No DTOs — the
# import handler reads the UploadFile and the `confirm` form field directly.
# All paths come from app.config (DB_PATH / PHOTO_DIR); nothing is hard-coded.

import os
import shutil
import sqlite3
import tempfile
import zipfile

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app import config
from app.database import connection
from app.database.connection import get_db
from app.middleware.dependencies import require_admin, require_caregiver

router = APIRouter(tags=["backup"])

# Name of the SQLite file inside an exported bundle.
_DB_ENTRY = "echovault.db"
# Folder inside the bundle that holds photos (filenames preserved).
_PHOTO_ENTRY_DIR = "photos"
# Tables every valid EchoVault backup must contain — sanity check before swap.
_EXPECTED_TABLES = ("patient", "caregivers", "memories", "settings")


# ─────────────────────────────── helpers ────────────────────────────────


def _manila_date(conn):
    """Today's Manila-local date as YYYY-MM-DD.

    Derived from SQLite datetime('now','localtime') to match the project's
    Manila-localtime convention (the hub runs in Asia/Manila).
    """
    row = conn.execute("SELECT date('now','localtime')").fetchone()
    return row[0]


def _snapshot_db(conn, dest_path):
    """Write a CONSISTENT copy of the live DB to dest_path.

    Uses sqlite3.Connection.backup, which produces a transactionally
    consistent copy even while the source is live — never copies the file
    mid-write.
    """
    dest = sqlite3.connect(dest_path)
    try:
        conn.backup(dest)
    finally:
        dest.close()


def _valid_backup_tables(db_path):
    """Return True if db_path opens as SQLite and has the expected tables."""
    try:
        conn = sqlite3.connect(db_path)
    except sqlite3.Error:
        return False
    try:
        rows = conn.execute(
            "SELECT name FROM sqlite_master WHERE type = 'table'"
        ).fetchall()
    except sqlite3.DatabaseError:
        # Not a real SQLite database.
        return False
    finally:
        conn.close()
    names = {r[0] for r in rows}
    return all(t in names for t in _EXPECTED_TABLES)


# ─────────────────────────────── BKP-1 export ───────────────────────────────


@router.get("/backup/export")
def export_backup(caregiver=Depends(require_caregiver), conn=Depends(get_db)):
    """Export a zip of the database and every photo. Caregiver only.

    The zip holds a consistent snapshot of the DB as `echovault.db` plus every
    file under PHOTO_DIR under `photos/` (filenames preserved). The download
    name carries the Manila-local export date.

    Password protection is intentionally deferred: Python's stdlib zipfile can
    read but not create encrypted zips, and a heavy crypto dependency is out of
    scope (BKP-1 marks it "if time allows"). The bundle is unencrypted.
    """
    export_date = _manila_date(conn)
    filename = "echovault-backup-{}.zip".format(export_date)

    # Build the snapshot + zip in a temp dir; the zip is handed to FileResponse
    # and cleaned up after the response is sent.
    tmp_dir = tempfile.mkdtemp(prefix="echovault-export-")
    snapshot_path = os.path.join(tmp_dir, _DB_ENTRY)
    zip_path = os.path.join(tmp_dir, filename)

    _snapshot_db(conn, snapshot_path)

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.write(snapshot_path, _DB_ENTRY)
        # Add every photo, preserving filenames. Missing dir -> no photos.
        if os.path.isdir(config.PHOTO_DIR):
            for name in sorted(os.listdir(config.PHOTO_DIR)):
                src = os.path.join(config.PHOTO_DIR, name)
                if os.path.isfile(src):
                    zf.write(src, "{}/{}".format(_PHOTO_ENTRY_DIR, name))

    # The snapshot is now inside the zip; drop it so only the zip is served.
    os.remove(snapshot_path)

    # BackgroundTask removes the temp dir once the response has streamed out.
    from starlette.background import BackgroundTask

    return FileResponse(
        zip_path,
        media_type="application/zip",
        filename=filename,
        headers={
            "Content-Disposition": 'attachment; filename="{}"'.format(filename)
        },
        background=BackgroundTask(shutil.rmtree, tmp_dir, ignore_errors=True),
    )


# ─────────────────────────────── BKP-2 import ───────────────────────────────


@router.post("/backup/import")
async def import_backup(
    file: UploadFile = File(...),
    confirm: str = Form(None),
    caregiver=Depends(require_admin),
    conn=Depends(get_db),
):
    """Replace the DB and photos from a backup bundle. Admin only.

    Requires an explicit confirmation. The upload is fully validated BEFORE any
    live data is touched; an invalid bundle leaves current data untouched. The
    swap is transactional with a `.bak` sidecar so a mid-swap failure restores
    the original hub.

    No-restart: connection.get_db opens a FRESH connection against
    config.DB_PATH per request and caches no global handle (see connection.py),
    so swapping the file on disk is enough — the next request reads the new
    data with no process restart.
    """
    # (a) explicit confirmation or reject.
    if str(confirm).lower() != "true":
        raise HTTPException(
            status_code=400, detail="Import requires explicit confirmation"
        )

    # (b) stage + validate the upload before touching anything live.
    stage_dir = tempfile.mkdtemp(prefix="echovault-import-")
    upload_path = os.path.join(stage_dir, "upload.zip")
    try:
        with open(upload_path, "wb") as out:
            shutil.copyfileobj(file.file, out)

        if not zipfile.is_zipfile(upload_path):
            raise HTTPException(status_code=400, detail="Not a valid zip file")

        with zipfile.ZipFile(upload_path) as zf:
            names = zf.namelist()
            if _DB_ENTRY not in names:
                raise HTTPException(
                    status_code=400, detail="Backup is missing echovault.db"
                )
            zf.extractall(stage_dir)

        staged_db = os.path.join(stage_dir, _DB_ENTRY)
        if not _valid_backup_tables(staged_db):
            raise HTTPException(
                status_code=400, detail="Not a valid EchoVault backup"
            )

        # (c) transactional swap keyed off config paths. The admin check ran on this
        # request's connection; Windows refuses to replace a database file that is open.
        conn.close()
        _swap_in(stage_dir)
    except HTTPException:
        # Validation / confirmation failures: current data is untouched.
        raise
    finally:
        shutil.rmtree(stage_dir, ignore_errors=True)

    return {"status": "imported", "detail": "Backup restored"}


def _swap_in(stage_dir):
    """Swap the validated staged bundle into place, with .bak rollback.

    Moves the live DB and photos dir aside to `.bak` sidecars, installs the new
    DB and photos, then runs migrate() to upgrade an older backup schema. On
    full success the sidecars are removed; on ANY failure the originals are
    restored from the sidecars so the hub is never left broken.
    """
    db_path = str(config.DB_PATH)
    photo_dir = str(config.PHOTO_DIR)
    db_bak = db_path + ".bak"
    photo_bak = photo_dir + ".bak"

    staged_db = os.path.join(stage_dir, _DB_ENTRY)
    staged_photos = os.path.join(stage_dir, _PHOTO_ENTRY_DIR)

    # Clear any stale sidecars from a prior crashed import.
    if os.path.exists(db_bak):
        os.remove(db_bak)
    if os.path.exists(photo_bak):
        shutil.rmtree(photo_bak, ignore_errors=True)

    db_moved = False
    photos_moved = False
    try:
        # Move existing live data aside (only if present).
        if os.path.exists(db_path):
            os.replace(db_path, db_bak)
            db_moved = True
        if os.path.isdir(photo_dir):
            os.replace(photo_dir, photo_bak)
            photos_moved = True

        # Install the new DB.
        parent = os.path.dirname(db_path)
        if parent:
            os.makedirs(parent, exist_ok=True)
        shutil.copyfile(staged_db, db_path)

        # Install new photos (always create the dir, even if the bundle had none).
        os.makedirs(photo_dir, exist_ok=True)
        if os.path.isdir(staged_photos):
            for name in os.listdir(staged_photos):
                src = os.path.join(staged_photos, name)
                if os.path.isfile(src):
                    shutil.copyfile(src, os.path.join(photo_dir, name))

        # Re-run migrate() to upgrade an older backup schema.
        conn = connection.connect(db_path)
        try:
            connection.migrate(conn)
        finally:
            conn.close()
    except Exception as exc:
        # Rollback: restore originals from the sidecars over any partial state.
        if os.path.exists(db_path):
            os.remove(db_path)
        if os.path.isdir(photo_dir):
            shutil.rmtree(photo_dir, ignore_errors=True)
        if db_moved and os.path.exists(db_bak):
            os.replace(db_bak, db_path)
        if photos_moved and os.path.isdir(photo_bak):
            os.replace(photo_bak, photo_dir)
        raise HTTPException(
            status_code=500, detail="Import failed; original data restored"
        ) from exc

    # Full success — drop the sidecars.
    if os.path.exists(db_bak):
        os.remove(db_bak)
    if os.path.isdir(photo_bak):
        shutil.rmtree(photo_bak, ignore_errors=True)
