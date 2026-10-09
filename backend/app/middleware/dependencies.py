"""Role resolution and caregiver gate.

Patient-mode requests send ``X-Role: patient``. Caregiver-mode requests send
``X-Role: caregiver`` plus ``X-Caregiver-Id``. This is the minimal auth Module 11
needs — no admin/editor/viewer access-level logic (Auth module owns that).
"""

from typing import Optional

from fastapi import Depends, Header, HTTPException

from app.constants import ROLES
from app.database.connection import get_db


def get_role(
    x_role: Optional[str] = Header(default=None, alias="X-Role"),
    x_caregiver_id: Optional[str] = Header(default=None, alias="X-Caregiver-Id"),
):
    """Resolve the caller's role from headers. 403 on missing/unknown role."""
    if not x_role or x_role not in ROLES:
        raise HTTPException(status_code=403, detail="Missing or invalid X-Role header")
    return {"role": x_role, "caregiver_id": x_caregiver_id}


def require_caregiver(identity=Depends(get_role), conn=Depends(get_db)):
    """Allow only active caregivers. 403 for patient role or unknown caregiver.

    Returns the authenticated caregiver id.
    """
    if identity["role"] != "caregiver":
        raise HTTPException(status_code=403, detail="Caregiver role required")

    caregiver_id = identity["caregiver_id"]
    if not caregiver_id:
        raise HTTPException(status_code=403, detail="Missing X-Caregiver-Id header")

    row = conn.execute(
        "SELECT id FROM caregivers WHERE id = ? AND is_active = 1",
        (caregiver_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=403, detail="Unknown or inactive caregiver")

    return caregiver_id
