# get_role (patient|caregiver from header), require_caregiver
import sqlite3

from fastapi import Depends, Header, HTTPException

from app.constants import ACCESS_ADMIN, ROLE_CAREGIVER, ROLES
from app.database.connection import get_db


def get_role(x_role: str | None = Header(default=None)) -> str:
    if x_role not in ROLES:
        raise HTTPException(401, f"X-Role header must be one of: {', '.join(ROLES)}")
    return x_role


def require_caregiver(
    role: str = Depends(get_role),
    x_caregiver_id: str | None = Header(default=None),
    db: sqlite3.Connection = Depends(get_db),
) -> dict:
    if role != ROLE_CAREGIVER:
        raise HTTPException(403, "Caregiver access required")
    if not x_caregiver_id:
        raise HTTPException(401, "X-Caregiver-Id header is required")
    row = db.execute(
        "SELECT id, name, relationship, access_level FROM caregivers WHERE id = ? AND is_active = 1",
        (x_caregiver_id,),
    ).fetchone()
    if row is None:
        raise HTTPException(401, "Unknown or inactive caregiver")
    return dict(row)


def require_admin(caregiver: dict = Depends(require_caregiver)) -> dict:
    if caregiver["access_level"] != ACCESS_ADMIN:
        raise HTTPException(403, "Admin access required")
    return caregiver
