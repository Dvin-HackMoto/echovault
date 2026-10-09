# CRUD + POST /people/{id}/photo

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile

from . import repository, service
from .deps import ROLE_CAREGIVER, TRUST_STATUSES, TRUST_VERIFIED, get_db, get_role, require_caregiver

router = APIRouter(prefix="/people", tags=["people"])


def _found(person, role=ROLE_CAREGIVER):
    # to the patient, a person who is not verified does not exist
    if person is None or (role != ROLE_CAREGIVER and person["trust"] != TRUST_VERIFIED):
        raise HTTPException(404, "Person not found")
    return service.with_photo_url(person)


@router.get("")
def list_people(trust: str | None = None, role=Depends(get_role), conn=Depends(get_db)):
    """Everyone, by name. ?trust= filters for a caregiver; the patient only ever gets verified people."""
    if role != ROLE_CAREGIVER:
        trust = TRUST_VERIFIED
    elif trust and trust not in TRUST_STATUSES:
        raise HTTPException(422, f"trust must be one of {', '.join(TRUST_STATUSES)}")
    return [service.with_photo_url(p) for p in repository.list_people(conn, trust=trust)]


@router.get("/{person_id}")
def get_person(person_id: str, role=Depends(get_role), conn=Depends(get_db)):
    return _found(repository.get_person(conn, person_id), role)


@router.post("", status_code=201)
def create_person(payload: dict = Body(...), caregiver=Depends(require_caregiver), conn=Depends(get_db)):
    """Body: {name, relationship, nickname?, notes?, is_caregiver?, trust? (default unverified)}."""
    person = service.validate_person(payload)
    person_id = repository.create_person(conn, person, caregiver["id"])
    return _found(repository.get_person(conn, person_id))


@router.put("/{person_id}", dependencies=[Depends(require_caregiver)])
def update_person(person_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Partial update. Setting is_caregiver on one person clears it on everyone else."""
    existing = _found(repository.get_person(conn, person_id))
    repository.update_person(conn, person_id, service.validate_person({**existing, **payload}))
    return _found(repository.get_person(conn, person_id))


@router.delete("/{person_id}", status_code=204, dependencies=[Depends(require_caregiver)])
def delete_person(person_id: str, conn=Depends(get_db)):
    service.delete(conn, _found(repository.get_person(conn, person_id)))


@router.post("/{person_id}/photo", dependencies=[Depends(require_caregiver)])
def upload_photo(person_id: str, photo: UploadFile = File(...), conn=Depends(get_db)):
    """The person's photo (multipart field `photo`): JPEG, PNG or WebP, up to 10 MB."""
    person = _found(repository.get_person(conn, person_id))
    service.save_photo(conn, person, photo)
    return _found(repository.get_person(conn, person_id))
