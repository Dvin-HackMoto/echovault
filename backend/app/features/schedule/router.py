# CRUD, GET /schedule/today, GET /schedule/next, POST /schedule/{id}/ack

from fastapi import APIRouter, Body, Depends, HTTPException

from . import repository, service
from .deps import SCHEDULE_KINDS, get_db, get_role, require_caregiver

router = APIRouter(prefix="/schedule", tags=["schedule"])


# /today and /next are declared before /{item_id} so they are not read as ids.


@router.get("/today", dependencies=[Depends(get_role)])
def today(date: str | None = None, conn=Depends(get_db)):
    """Every occurrence on the current Manila date (or ?date=YYYY-MM-DD), in time order."""
    day = service.parse_date(date) if date else None
    return service.today(conn, day)


@router.get("/next", dependencies=[Depends(get_role)])
def next_item(conn=Depends(get_db)):
    """The nearest future occurrence, or null when nothing is scheduled."""
    return service.next_occurrence(conn)


@router.get("", dependencies=[Depends(get_role)])
def list_items(kind: str | None = None, active_only: bool = False, conn=Depends(get_db)):
    if kind and kind not in SCHEDULE_KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(SCHEDULE_KINDS)}")
    return repository.list_items(conn, kind, active_only)


@router.get("/{item_id}", dependencies=[Depends(get_role)])
def get_item(item_id: str, conn=Depends(get_db)):
    item = repository.get_item(conn, item_id)
    if item is None:
        raise HTTPException(404, "Schedule item not found")
    return item


@router.post("", status_code=201, dependencies=[Depends(require_caregiver)])
def create_item(payload: dict = Body(...), conn=Depends(get_db)):
    item = service.validate_item(payload)
    service.check_links(conn, item)
    return repository.create_item(conn, item)


@router.put("/{item_id}", dependencies=[Depends(require_caregiver)])
def update_item(item_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Partial update: fields left out of the payload keep their saved values."""
    existing = repository.get_item(conn, item_id)
    if existing is None:
        raise HTTPException(404, "Schedule item not found")
    item = service.validate_item({**existing, **payload})
    service.check_links(conn, item)
    return repository.update_item(conn, item_id, item)


@router.delete("/{item_id}", status_code=204, dependencies=[Depends(require_caregiver)])
def delete_item(item_id: str, conn=Depends(get_db)):
    if not repository.delete_item(conn, item_id):
        raise HTTPException(404, "Schedule item not found")


@router.post("/{item_id}/ack", dependencies=[Depends(get_role)])
def acknowledge(item_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {occurrence_at, response: acknowledged|dismissed|snoozed}. Sending again updates it."""
    return service.acknowledge(conn, item_id, payload)
