# CRUD, POST /memories/{id}/verify, GET ?trust=&category=
#
# MEM-1 (CRUD), MEM-2 (verify + verified-edit reset), MEM-4 (conflict flag /
# resolve), MEM-5 (source + care_safety safety). No DTOs — handlers take
# `payload: dict = Body(...)` and validate required fields / enum values
# manually against constants.py. Mirrors the settings-router pattern. Daily
# expiry (MEM-3) is run via service.run_daily_expiry at the top of GET /memories
# and on startup (wired in app/main.py).

from fastapi import APIRouter, Body, Depends, HTTPException

from app import constants
from app.database.connection import get_db
from app.features.memories import repository, service
from app.middleware.dependencies import get_role, require_caregiver

router = APIRouter(tags=["memories"])

# Enum fields validated when present in a create/update payload.
_ENUM_FIELDS = {
    "category": constants.CATEGORIES,
    "importance": constants.IMPORTANCE,
    "trust": constants.TRUST,
    "validity": constants.VALIDITY,
    "source": constants.MEMORY_SOURCES,
}


def _validate_enums(payload):
    for field, allowed in _ENUM_FIELDS.items():
        if field in payload and payload[field] is not None:
            if payload[field] not in allowed:
                raise HTTPException(
                    status_code=400,
                    detail="{} must be one of {}".format(field, list(allowed)),
                )


def _validate_references(conn, payload):
    """When provided (and non-null), person_id/place_id must reference an
    existing row."""
    person_id = payload.get("person_id")
    if person_id:
        if conn.execute(
            "SELECT 1 FROM people WHERE id = ?", (person_id,)
        ).fetchone() is None:
            raise HTTPException(status_code=400, detail="person_id does not exist")
    place_id = payload.get("place_id")
    if place_id:
        if conn.execute(
            "SELECT 1 FROM places WHERE id = ?", (place_id,)
        ).fetchone() is None:
            raise HTTPException(status_code=400, detail="place_id does not exist")


@router.get("/memories")
def list_memories(
    trust=None,
    category=None,
    identity=Depends(get_role),
    conn=Depends(get_db),
):
    """List memories. Caregiver may filter by ?trust=&category=; patient gets
    the verified+valid retrieval window only."""
    # MEM-3: run the once-per-day expiry sweep before serving the list.
    service.run_daily_expiry(conn)

    if trust is not None and trust not in constants.TRUST:
        raise HTTPException(
            status_code=400,
            detail="trust must be one of {}".format(list(constants.TRUST)),
        )
    if category is not None and category not in constants.CATEGORIES:
        raise HTTPException(
            status_code=400,
            detail="category must be one of {}".format(list(constants.CATEGORIES)),
        )
    return repository.list_memories(
        conn, identity["role"], trust=trust, category=category
    )


@router.get("/memories/{memory_id}")
def get_memory(
    memory_id: str,
    identity=Depends(get_role),
    conn=Depends(get_db),
):
    """Get one memory. Patient only sees it if it passes the retrieval window."""
    memory = repository.get_memory(conn, memory_id, role=identity["role"])
    if memory is None:
        raise HTTPException(status_code=404, detail="memory not found")
    return memory


@router.post("/memories")
def create_memory(
    payload: dict = Body(...),
    identity=Depends(get_role),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Create a memory. Caregiver only (require_caregiver already 403s patients).
    content required; enums validated; trust defaults 'unverified'; source
    defaults 'caregiver'. MEM-5 rules applied."""
    content = payload.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(status_code=400, detail="content is required")

    _validate_enums(payload)
    _validate_references(conn, payload)

    data = dict(payload)

    # MEM-5: patient-authored care_safety memories are forbidden. All writes are
    # already caregiver-gated, but enforce the rule explicitly so it holds even
    # for a caregiver submitting on a patient's behalf.
    if (
        identity["role"] == constants.ROLE_PATIENT
        and data.get("category") == constants.CATEGORY_CARE_SAFETY
    ):
        raise HTTPException(
            status_code=403, detail="patient cannot create care_safety memories"
        )

    # MEM-5: patient/ai_suggested sources are never trusted on create.
    if data.get("source") in (constants.SOURCE_PATIENT, constants.SOURCE_AI_SUGGESTED):
        data["trust"] = constants.TRUST_UNVERIFIED

    memory = repository.create_memory(conn, data)
    # MEM-4: flag a conflict against an existing same-person/category/FTS match.
    service.flag_conflicts(conn, memory["id"])
    return repository.get_memory(conn, memory["id"])


@router.put("/memories/{memory_id}")
def update_memory(
    memory_id: str,
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Partial update of a memory. Caregiver only. Editing a verified row's
    content/title resets it to unverified (MEM-2). Archiving/outdating a
    conflicting row tears down the conflict and restores the other row."""
    if "content" in payload:
        if not isinstance(payload["content"], str) or not payload["content"].strip():
            raise HTTPException(status_code=400, detail="content must not be empty")
    _validate_enums(payload)
    _validate_references(conn, payload)

    before = conn.execute(
        "SELECT trust, conflicts_with FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    if before is None:
        raise HTTPException(status_code=404, detail="memory not found")

    updated = repository.update_memory(conn, memory_id, payload)

    # MEM-4 teardown: if a conflicting row is archived or marked outdated via a
    # normal update, resolve the pair and restore the other row to verified.
    archived = payload.get("validity") == constants.VALIDITY_ARCHIVED
    outdated = payload.get("trust") == constants.TRUST_OUTDATED
    if before["conflicts_with"] and (archived or outdated):
        service.clear_conflict(conn, memory_id)
    else:
        # Re-evaluate conflicts after an edit (text/person/category may change).
        service.flag_conflicts(conn, memory_id)

    return repository.get_memory(conn, memory_id)


@router.delete("/memories/{memory_id}")
def delete_memory(
    memory_id: str,
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Delete a memory. Caregiver only."""
    if not repository.delete_memory(conn, memory_id):
        raise HTTPException(status_code=404, detail="memory not found")
    return {}


@router.post("/memories/{memory_id}/verify")
def verify_memory(
    memory_id: str,
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """MEM-2: mark a memory verified (caregiver only). No request body."""
    memory = repository.verify_memory(conn, memory_id, caregiver_id)
    if memory is None:
        raise HTTPException(status_code=404, detail="memory not found")
    return memory


@router.post("/memories/{memory_id}/resolve")
def resolve_memory_conflict(
    memory_id: str,
    payload: dict = Body(...),
    caregiver_id=Depends(require_caregiver),
    conn=Depends(get_db),
):
    """MEM-4 resolve endpoint. Keep this memory (-> verified) and send the other
    conflicting memory to 'archived' or 'outdated'; clears conflicts_with on
    both. Body: {"other_outcome": "archived"|"outdated"} (the other id is read
    from this row's conflicts_with). Caregiver only."""
    other_outcome = payload.get("other_outcome", constants.VALIDITY_ARCHIVED)
    row = conn.execute(
        "SELECT id, conflicts_with FROM memories WHERE id = ?", (memory_id,)
    ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="memory not found")
    if not row["conflicts_with"]:
        raise HTTPException(status_code=400, detail="memory is not in conflict")

    try:
        service.resolve_conflict(
            conn, memory_id, row["conflicts_with"], other_outcome
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except LookupError:
        raise HTTPException(status_code=404, detail="memory not found")

    return repository.get_memory(conn, memory_id)
