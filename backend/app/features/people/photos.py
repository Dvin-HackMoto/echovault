# photo files for people and places (features/places/ uses this too)
#
# photo_path in the DB is a file name inside PHOTO_DIR; main.py serves it at /photos/<photo_path>.
# Uploaded files are named '<prefix>-<uuid>.<ext>' ('person-...', 'place-...'). Only files with
# that prefix are ever deleted, so the bundled 'seed-*.png' demo photos stay.

import uuid
from pathlib import Path

from fastapi import HTTPException

from .deps import photo_dir

MAX_PHOTO_BYTES = 10 * 1024 * 1024


def _extension(data):
    """The image type is read from the file's first bytes, not from the name or the
    Content-Type the phone sent, so a renamed non-image is rejected."""
    if data.startswith(b"\xff\xd8\xff"):
        return ".jpg"
    if data.startswith(b"\x89PNG\r\n\x1a\n"):
        return ".png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return ".webp"
    return None


def save(upload, prefix):
    """Writes the uploaded image under a generated name and returns that name."""
    data = upload.file.read(MAX_PHOTO_BYTES + 1)
    if len(data) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "photo must be 10 MB or smaller")
    ext = _extension(data)
    if ext is None:
        raise HTTPException(422, "photo must be a JPEG, PNG or WebP image")
    folder = Path(photo_dir())
    folder.mkdir(parents=True, exist_ok=True)
    name = f"{prefix}-{uuid.uuid4().hex}{ext}"
    (folder / name).write_bytes(data)
    return name


def remove(name, prefix):
    if name and name.startswith(f"{prefix}-"):
        (Path(photo_dir()) / name).unlink(missing_ok=True)


def with_photo_url(row):
    return {**row, "photo_url": f"/photos/{row['photo_path']}" if row.get("photo_path") else None}
