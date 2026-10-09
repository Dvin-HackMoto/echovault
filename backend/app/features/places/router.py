# CRUD + POST /places/{id}/photo

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from . import repository, service
from .deps import ROLE_CAREGIVER, TRUST_STATUSES, TRUST_VERIFIED, get_db, get_role, require_caregiver

router = APIRouter(prefix="/places", tags=["places"])


def _found(place, role=ROLE_CAREGIVER):
    # to the patient, a place that is not verified does not exist
    if place is None or (role != ROLE_CAREGIVER and place["trust"] != TRUST_VERIFIED):
        raise HTTPException(404, "Place not found")
    return service.with_photo_url(place)


@router.get("")
def list_places(trust: str | None = None, role=Depends(get_role), conn=Depends(get_db)):
    """Every place, by name. ?trust= filters for a caregiver; the patient only ever gets verified places."""
    if role != ROLE_CAREGIVER:
        trust = TRUST_VERIFIED
    elif trust and trust not in TRUST_STATUSES:
        raise HTTPException(422, f"trust must be one of {', '.join(TRUST_STATUSES)}")
    return [service.with_photo_url(p) for p in repository.list_places(conn, trust=trust)]


@router.get("/{place_id}")
def get_place(place_id: str, role=Depends(get_role), conn=Depends(get_db)):
    return _found(repository.get_place(conn, place_id), role)


@router.post("", status_code=201, dependencies=[Depends(require_caregiver)])
def create_place(payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {name, description?, address?, trust? (default unverified)}."""
    place_id = repository.create_place(conn, service.validate_place(payload))
    return _found(repository.get_place(conn, place_id))


@router.put("/{place_id}", dependencies=[Depends(require_caregiver)])
def update_place(place_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Partial update."""
    existing = _found(repository.get_place(conn, place_id))
    repository.update_place(conn, place_id, service.validate_place({**existing, **payload}))
    return _found(repository.get_place(conn, place_id))


@router.delete("/{place_id}", status_code=204, dependencies=[Depends(require_caregiver)])
def delete_place(place_id: str, conn=Depends(get_db)):
    service.delete(conn, _found(repository.get_place(conn, place_id)))


@router.post("/{place_id}/photo", dependencies=[Depends(require_caregiver)])
def upload_photo(place_id: str, photo: UploadFile = File(...), conn=Depends(get_db)):
    """The place's photo (multipart field `photo`): JPEG, PNG or WebP, up to 10 MB."""
    place = _found(repository.get_place(conn, place_id))
    service.save_photo(conn, place, photo)
    return _found(repository.get_place(conn, place_id))
