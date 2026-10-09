# get_role (patient|caregiver from header), require_caregiver, require_admin,
# enforce_access_level (applied to every route by main.create_app)
import sqlite3

from fastapi import Depends, Header, HTTPException, Request

from app.constants import ACCESS_ADMIN, ACCESS_VIEWER, ROLE_CAREGIVER, ROLES
from app.database.connection import connect, get_db


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


# AUTH-3: methods that create, change or delete records
WRITE_METHODS = frozenset({"POST", "PUT", "PATCH", "DELETE"})
# POST routes that change no records, so a viewer may use them
READ_ONLY_POSTS = frozenset({"/auth/pin", "/assistant/ask", "/assistant/voice"})


def enforce_access_level(request: Request) -> None:
    """Runs before every route (main.create_app registers it app-wide), so every feature
    module is covered without adding anything to its routes:
    - a `viewer` caregiver gets 403 on any create, update or delete;
    - only an `admin` may DELETE.
    Patient requests, reads, and unknown caregivers pass through untouched: the route's
    own get_role / require_caregiver still decides those. Headers are read from the request
    (not declared as parameters) so they do not appear on every route in /docs."""
    if request.method not in WRITE_METHODS or request.url.path in READ_ONLY_POSTS:
        return
    caregiver_id = request.headers.get("x-caregiver-id")
    if request.headers.get("x-role") != ROLE_CAREGIVER or not caregiver_id:
        return
    conn = connect()
    try:
        row = conn.execute(
            "SELECT access_level FROM caregivers WHERE id = ? AND is_active = 1", (caregiver_id,)
        ).fetchone()
    finally:
        conn.close()
    if row is None:
        return
    if row["access_level"] == ACCESS_VIEWER:
        raise HTTPException(403, "Viewer access is read-only")
    if request.method == "DELETE" and row["access_level"] != ACCESS_ADMIN:
        raise HTTPException(403, "Only an admin can delete records")
