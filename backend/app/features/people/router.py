# CRUD + POST /people/{id}/photo
#
# PPL-1 (people CRUD) and PPL-2 (photo upload). No DTOs — handlers take
# `payload: dict = Body(...)` and validate required fields / enum values
# manually against constants.py. Mirrors the settings-router pattern
# (dual Depends(require_caregiver)+Depends(get_db), manual validation,
# datetime('now','localtime')). Writes are caregiver-only; patient mode is
# read-only and sees only verified people.

import os
from uuid import uuid4

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from app import config, constants
from app.database.connection import get_db
from app.features.people import repository
from app.middleware.dependencies import get_role, require_caregiver

router = APIRouter(tags=["people"])

# Accepted image extensions for the photo upload (PPL-2).
_IMAGE_EXTENSIONS = (".jpg", ".jpeg", ".png", ".gif", ".webp")


def _validate_person_payload(payload, require_fields):
    """Validate writable person fields. On create, name+relationship are
    required and non-empty; on update they must be non-empty only when present.
    trust, when present, must be a known enum value."""
    if require_fields:
        for field in ("name", "relationship"):
            value = payload.get(field)
            if not isinstance(value, str) or not value.strip():
                raise HTTPException(
                    status_code=400,
                    detail="{} is required".format(field),
                )
    else:
        for field in ("name", "relationship"):
            if field in payload:
                value = payload[field]
                if not isinstance(value, str) or not value.strip():
                    raise HTTPException(
                        status_code=400,
                        detail="{} must not be empty".format(field),
                    )

    if "trust" in payload and payload["trust"] is not None:
        if payload["trust"] not in constants.TRUST:
            raise HTTPException(
                status_code=400,
                detail="trust must be one of {}".format(list(constants.TRUST)),
            )


@router.get("/people")
def list_people(
    trust=None,
    identity=Depends(get_role),
    conn=Depends(get_db),
):
    """List people. Caregiver sees all (optional ?trust= filter); patient sees
    only verified people."""
    if identity["role"] == constants.ROLE_PATIENT:
        return repository.list_people(conn, verified_only=True)

    if trust is not None and trust not in constants.TRUST:
        raise HTTPException(
            status_code=400,
            detail="trust must be one of {}".format(list(constants.TRUST)),
        )
    return repository.list_people(conn, trust=trust)


@router.get("/people/{person_id}")
def get_person(
    person_id: str,
    identity=Depends(get_role),
    conn=Depends(get_db),
):
    """Get one person. Patient only sees verified people (404 otherwise)."""
    person = repository.get_person(conn, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")
    if (
        identity["role"] == constants.ROLE_PATIENT
        and person["trust"] != constants.TRUST_VERIFIED
    ):
        raise HTTPException(status_code=404, detail="person not found")
    return person


@router.post("/people")
def create_person(
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Create a person. Caregiver only. name+relationship required; trust
    defaults to 'unverified'; created_by is the authenticated caregiver."""
    _validate_person_payload(payload, require_fields=True)
    return repository.create_person(conn, payload, created_by=caregiver_id)


@router.put("/people/{person_id}")
def update_person(
    person_id: str,
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Partial update of a person. Caregiver only."""
    _validate_person_payload(payload, require_fields=False)
    updated = repository.update_person(conn, person_id, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="person not found")
    return updated


@router.delete("/people/{person_id}")
def delete_person(
    person_id: str,
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Delete a person. Caregiver only. Linked memories keep their row with
    person_id NULL (FK ON DELETE SET NULL)."""
    if not repository.delete_person(conn, person_id):
        raise HTTPException(status_code=404, detail="person not found")
    return {}


@router.post("/people/{person_id}/photo")
async def upload_photo(
    person_id: str,
    file: UploadFile = File(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Upload/replace a person's photo (multipart). Caregiver only.

    Rejects non-image uploads (content-type must start with image/ or a known
    image extension). Stores a RELATIVE path under config.PHOTO_DIR in
    people.photo_path and removes the previously stored file when replacing.
    """
    person = repository.get_person(conn, person_id)
    if person is None:
        raise HTTPException(status_code=404, detail="person not found")

    _, ext = os.path.splitext(file.filename or "")
    ext = ext.lower()
    content_type = file.content_type or ""
    is_image = content_type.startswith("image/") or ext in _IMAGE_EXTENSIONS
    if not is_image:
        raise HTTPException(status_code=400, detail="file must be an image")

    if ext not in _IMAGE_EXTENSIONS:
        # Fall back to a safe extension derived from the content type.
        ext = ".jpg" if content_type == "image/jpeg" else ".img"

    filename = "{}{}".format(uuid4().hex, ext)
    os.makedirs(config.PHOTO_DIR, exist_ok=True)
    dest = os.path.join(config.PHOTO_DIR, filename)
    data = await file.read()
    with open(dest, "wb") as fh:
        fh.write(data)

    # Remove the old file (if any) after the new one is safely written.
    old_path = person.get("photo_path")
    if old_path and old_path != dest and os.path.isfile(old_path):
        try:
            os.remove(old_path)
        except OSError:
            pass

    return repository.update_person(conn, person_id, {"photo_path": dest})
