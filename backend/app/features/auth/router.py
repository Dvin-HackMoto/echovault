# POST /auth/pin (caregiver), GET /auth/me
#
# AUTH-2. The phone sends a PIN; the hub answers with the caregiver it belongs to and
# their access_level, and the phone then sends X-Role: caregiver and X-Caregiver-Id.
# The PIN is never echoed: the body is read untyped so a malformed one cannot come back
# in a validation error, and every refusal uses the same message.
from typing import Any

from fastapi import APIRouter, Body, Depends, HTTPException

from app.database.connection import get_db
from app.middleware.dependencies import require_caregiver

from . import service

router = APIRouter(prefix="/auth", tags=["auth"])

WRONG_PIN = "Wrong PIN"


@router.post("/pin")
def pin_login(payload: Any = Body(None), conn=Depends(get_db)):
    """Body: {pin, caregiver_id?}. caregiver_id is only needed when two caregivers share a PIN.
    200: {id, name, relationship, access_level}. 401: wrong PIN or inactive caregiver.
    409: the PIN matches more than one caregiver. 429: too many wrong PINs, wait Retry-After seconds."""
    pin = payload.get("pin") if isinstance(payload, dict) else None
    caregiver_id = payload.get("caregiver_id") if isinstance(payload, dict) else None
    if not isinstance(pin, str) or not pin:
        raise HTTPException(422, "pin is required (a string of digits)")
    if caregiver_id is not None and not isinstance(caregiver_id, str):
        raise HTTPException(422, "caregiver_id must be a string")

    wait = service.throttle.retry_after()
    if wait:
        raise HTTPException(
            429, f"Too many wrong PINs. Try again in {wait} seconds.", headers={"Retry-After": str(wait)}
        )

    matches = service.find_caregivers_by_pin(conn, pin, caregiver_id)
    if not matches:
        service.throttle.failed()
        raise HTTPException(401, WRONG_PIN)
    service.throttle.succeeded()
    if len(matches) > 1:
        raise HTTPException(409, {
            "message": "This PIN belongs to more than one caregiver. Choose your name.",
            "caregivers": [{"id": c["id"], "name": c["name"]} for c in matches],
        })
    return matches[0]


@router.get("/me")
def me(caregiver=Depends(require_caregiver)):
    """The caregiver named by X-Caregiver-Id: {id, name, relationship, access_level}."""
    return caregiver
