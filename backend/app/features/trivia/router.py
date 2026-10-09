# GET /trivia/next (respects quiet hours + appointments), POST /trivia/result,
# caregiver CRUD at /trivia/questions

from fastapi import APIRouter, Body, Depends, HTTPException

from . import repository, service
from .deps import (
    TRIVIA_KINDS, TRIVIA_SOURCE_CAREGIVER, TRIVIA_SOURCES, get_db, get_role, require_caregiver,
)

router = APIRouter(prefix="/trivia", tags=["trivia"])


def _found(question):
    if question is None:
        raise HTTPException(404, "Question not found")
    return question


@router.get("/next", dependencies=[Depends(get_role)])
def next_prompt(conn=Depends(get_db)):
    """A question to show now (with `people` for "See photos"), or null when this is not
    a good moment: quiet hours, a schedule item nearby, or the last prompt was too recent."""
    return service.next_prompt(conn)


@router.post("/result", status_code=201, dependencies=[Depends(get_role)])
def record_result(payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {question_id, outcome: completed|skipped, duration_sec?}. Saved to activity_log
    as 'trivia_prompt'. The next prompt waits trivia_frequency_min from this moment."""
    return service.record_result(conn, payload)


@router.get("/questions", dependencies=[Depends(require_caregiver)])
def list_questions(
    source: str | None = None, kind: str | None = None, active_only: bool = False, conn=Depends(get_db)
):
    if source and source not in TRIVIA_SOURCES:
        raise HTTPException(422, f"source must be one of {', '.join(TRIVIA_SOURCES)}")
    if kind and kind not in TRIVIA_KINDS:
        raise HTTPException(422, f"kind must be one of {', '.join(TRIVIA_KINDS)}")
    return repository.list_questions(conn, source=source, kind=kind, active_only=active_only)


@router.get("/questions/{question_id}", dependencies=[Depends(require_caregiver)])
def get_question(question_id: str, conn=Depends(get_db)):
    return _found(repository.get_question(conn, question_id))


@router.post("/questions", status_code=201, dependencies=[Depends(require_caregiver)])
def create_question(payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {kind, question, answer, choices?, topic?, memory_id?, difficulty?, is_active?}.
    personal, family and routine questions need a topic and the memory_id of a verified memory."""
    question = service.validate_question(conn, payload)
    question_id = repository.create_question(conn, question, TRIVIA_SOURCE_CAREGIVER)
    return _found(repository.get_question(conn, question_id))


@router.put("/questions/{question_id}", dependencies=[Depends(require_caregiver)])
def update_question(question_id: str, payload: dict = Body(...), conn=Depends(get_db)):
    """Partial update. {"is_active": false} switches a question off without deleting it;
    that is the only change a preloaded question accepts."""
    return service.update(conn, _found(repository.get_question(conn, question_id)), payload)


@router.delete("/questions/{question_id}", status_code=204, dependencies=[Depends(require_caregiver)])
def delete_question(question_id: str, conn=Depends(get_db)):
    service.delete(conn, _found(repository.get_question(conn, question_id)))
