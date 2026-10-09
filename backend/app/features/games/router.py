# GET /games/{type}/round, POST /games/result
#
# Both roles may call these (the caregiver phone can preview a round). Rounds are
# built from verified data on the caregiver's game_topics at game_difficulty; results
# are stored as engagement in activity_log, never as a score.

from fastapi import APIRouter, Body, Depends, HTTPException

from app.constants import ALLOWED_GAME_TOPICS, OUTCOMES
from app.database.connection import get_db
from app.middleware.dependencies import get_role

from . import generators, repository

router = APIRouter(prefix="/games", tags=["games"])

MAX_DURATION_SEC = 24 * 60 * 60


@router.get("/{game_type}/round", dependencies=[Depends(get_role)])
def get_round(game_type: str, conn=Depends(get_db)):
    """A round of `game_type`. When it can't be played, available is false and reason
    says why (topic_not_selected or not_enough_data)."""
    if game_type not in generators.GAMES:
        raise HTTPException(404, f"Unknown game type. Use one of {', '.join(generators.GAME_TYPES)}")
    return generators.build_round(conn, game_type)


def _optional_int(payload, field, low, high):
    value = payload.get(field)
    if value is None:
        return None
    if isinstance(value, bool) or not isinstance(value, int) or not (low <= value <= high):
        raise HTTPException(422, f"{field} must be a whole number from {low} to {high}")
    return value


def validate_result(payload):
    activity = payload.get("activity")
    if activity not in generators.GAMES:
        # trivia prompts are logged by features/trivia, not here
        raise HTTPException(422, f"activity must be one of {', '.join(generators.GAME_TYPES)}")
    outcome = payload.get("outcome")
    if outcome not in OUTCOMES:
        raise HTTPException(422, f"outcome must be one of {', '.join(OUTCOMES)}")
    topic = payload.get("topic")
    if topic is not None and topic not in ALLOWED_GAME_TOPICS:
        raise HTTPException(422, f"topic must be one of {', '.join(ALLOWED_GAME_TOPICS)}")
    question_ref = payload.get("question_ref")
    if question_ref is not None and not isinstance(question_ref, str):
        raise HTTPException(422, "question_ref must be a string")
    return {
        "activity": activity,
        "topic": topic,
        "question_ref": question_ref,
        "outcome": outcome,
        "difficulty": _optional_int(payload, "difficulty", 1, 3),
        "duration_sec": _optional_int(payload, "duration_sec", 0, MAX_DURATION_SEC),
    }


@router.post("/result", status_code=201, dependencies=[Depends(get_role)])
def post_result(payload: dict = Body(...), conn=Depends(get_db)):
    """Body: {activity, outcome, topic?, difficulty?, duration_sec?, question_ref?}.
    Send one per round: completed, skipped or stopped."""
    return repository.log_activity(conn, validate_result(payload))
