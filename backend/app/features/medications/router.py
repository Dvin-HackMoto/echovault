# CRUD, GET /medications/today, POST /medications/logs/{id} (taken|skipped)

from fastapi import APIRouter, Body, Depends, File, Header, HTTPException, UploadFile

from . import repository, service
from .deps import (
    MED_STATUSES, ROLE_CAREGIVER, caregiver_id_of, get_db, get_role, require_caregiver, role_of,
)

router = APIRouter(prefix="/medications", tags=["medications"])


def get_responder(
    identity=Depends(get_role),
    x_caregiver_id: str | None = Header(default=None),
    conn=Depends(get_db),
):
    """Confirming a dose is open to both roles, so require_caregiver cannot guard the
    endpoint. A caregiver gets the same check here: an active caregivers row."""
    role = role_of(identity)
    if role == ROLE_CAREGIVER:
        found = x_caregiver_id and conn.execute(
            "SELECT 1 FROM caregivers WHERE id = ? AND is_active = 1", (x_caregiver_id,)
        ).fetchone()
        if not found:
            raise HTTPException(403, "Unknown or inactive caregiver")
    return role


def _found(med):
    if med is None:
        raise HTTPException(404, "Medication not found")
    return service.with_photo_url(med)


# /today, /next and /logs are declared before /{med_id} so they are not read as ids.


@router.get("/today", dependencies=[Depends(get_role)])
def today(conn=Depends(get_db)):
    """Today's doses with status, in time order. Creates any missing 'unconfirmed' rows first."""
    return service.today_doses(conn)


@router.get("/next", dependencies=[Depends(get_role)])
def next_doses(conn=Depends(get_db)):
    """The medicines due at the next dose time (more than one if they share a time)."""
    return service.next_doses(conn)


@router.get("/logs", dependencies=[Depends(require_caregiver)])
def list_logs(
    date: str | None = None, status: str | None = None, overdue: bool = False, conn=Depends(get_db)
):
    """Dose history. ?overdue=true gives unconfirmed doses past their due time (dashboard)."""
    if overdue:
        return service.overdue_doses(conn)
    if status and status not in MED_STATUSES:
        raise HTTPException(422, f"status must be one of {', '.join(MED_STATUSES)}")
    day = service.parse_date(date, "date").isoformat() if date else None
    service.generate_logs(conn)
    return [service.with_photo_url(r) for r in repository.list_logs(conn, day=day, status=status)]


@router.post("/logs/{log_id}")
def confirm_dose(log_id: str, payload: dict = Body(...), role=Depends(get_responder), conn=Depends(get_db)):
    """Body: {status: taken|skipped (caregiver also: unconfirmed), note?}."""
    return service.confirm(conn, log_id, payload, role)


@router.get("")
def list_medications(identity=Depends(get_role), active_only: bool = False, conn=Depends(get_db)):
    # the patient only ever sees medicines that are currently active
    is_caregiver = role_of(identity) == ROLE_CAREGIVER
    meds = repository.list_medications(conn, active_only=active_only or not is_caregiver)
    return [service.with_photo_url(m) for m in meds]


@router.get("/{med_id}", dependencies=[Depends(get_role)])
def get_medication(med_id: str, conn=Depends(get_db)):
    return _found(repository.get_medication(conn, med_id))


@router.post("", status_code=201)
def create_medication(payload: dict = Body(...), caregiver=Depends(require_caregiver), conn=Depends(get_db)):
    """Body: {name, dose, instructions?, start_date?, end_date?, times: [{time_of_day, days?}]}."""
    med = service.validate_medication(payload)
    times = service.validate_times(payload.get("times"))
    med_id = repository.create_medication(conn, med, times, caregiver_id_of(caregiver))
    service.refresh_today(conn, med_id)
    return _found(repository.get_medication(conn, med_id))


@router.put("/{med_id}", dependencies=[Depends(require_caregiver)])
def update_medication(med_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Partial update. Sending `times` replaces all of them; leaving it out keeps them."""
    existing = _found(repository.get_medication(conn, med_id))
    med = service.validate_medication({**existing, **payload})
    times = service.validate_times(payload["times"]) if "times" in payload else None
    repository.update_medication(conn, med_id, med, times)
    service.refresh_today(conn, med_id)
    return _found(repository.get_medication(conn, med_id))


@router.delete("/{med_id}", status_code=204, dependencies=[Depends(require_caregiver)])
def delete_medication(med_id: str, conn=Depends(get_db)):
    if not repository.delete_medication(conn, med_id):
        raise HTTPException(404, "Medication not found")


@router.post("/{med_id}/photo", dependencies=[Depends(require_caregiver)])
def upload_photo(med_id: str, photo: UploadFile = File(...), conn=Depends(get_db)):
    """Pill or box photo for the patient's dose card (multipart field `photo`)."""
    med = _found(repository.get_medication(conn, med_id))
    service.save_photo(conn, med, photo)
    return _found(repository.get_medication(conn, med_id))
