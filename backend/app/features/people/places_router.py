# places CRUD (PPL-3, optional)
#
# Minimal places CRUD. No DTOs — handlers take `payload: dict = Body(...)` and
# validate manually. Writes are caregiver-only; patient mode is read-only and
# sees only verified places. Mirrors the people-router pattern.

from fastapi import APIRouter, Body, Depends, HTTPException

from app import constants
from app.database.connection import get_db
from app.features.people import places_repository as repository
from app.middleware.dependencies import get_role, require_caregiver

router = APIRouter(tags=["places"])


def _validate_place_payload(payload, require_name):
    if require_name:
        value = payload.get("name")
        if not isinstance(value, str) or not value.strip():
            raise HTTPException(status_code=400, detail="name is required")
    elif "name" in payload:
        value = payload["name"]
        if not isinstance(value, str) or not value.strip():
            raise HTTPException(status_code=400, detail="name must not be empty")

    if "trust" in payload and payload["trust"] is not None:
        if payload["trust"] not in constants.TRUST:
            raise HTTPException(
                status_code=400,
                detail="trust must be one of {}".format(list(constants.TRUST)),
            )


@router.get("/places")
def list_places(trust=None, identity=Depends(get_role), conn=Depends(get_db)):
    if identity["role"] == constants.ROLE_PATIENT:
        return repository.list_places(conn, verified_only=True)
    if trust is not None and trust not in constants.TRUST:
        raise HTTPException(
            status_code=400,
            detail="trust must be one of {}".format(list(constants.TRUST)),
        )
    return repository.list_places(conn, trust=trust)


@router.get("/places/{place_id}")
def get_place(place_id: str, identity=Depends(get_role), conn=Depends(get_db)):
    place = repository.get_place(conn, place_id)
    if place is None:
        raise HTTPException(status_code=404, detail="place not found")
    if (
        identity["role"] == constants.ROLE_PATIENT
        and place["trust"] != constants.TRUST_VERIFIED
    ):
        raise HTTPException(status_code=404, detail="place not found")
    return place


@router.post("/places")
def create_place(
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    _validate_place_payload(payload, require_name=True)
    return repository.create_place(conn, payload)


@router.put("/places/{place_id}")
def update_place(
    place_id: str,
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    _validate_place_payload(payload, require_name=False)
    updated = repository.update_place(conn, place_id, payload)
    if updated is None:
        raise HTTPException(status_code=404, detail="place not found")
    return updated


@router.delete("/places/{place_id}")
def delete_place(
    place_id: str,
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    if not repository.delete_place(conn, place_id):
        raise HTTPException(status_code=404, detail="place not found")
    return {}
