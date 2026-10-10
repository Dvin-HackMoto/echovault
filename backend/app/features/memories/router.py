# CRUD, POST /memories/{id}/verify, POST /memories/{id}/resolve, GET ?trust=&category=&person_id=
#
# MEM-1 (CRUD), MEM-2 (verify + verified-edit reset), MEM-4 (conflict flag /
# resolve), MEM-5 (source + care_safety safety). No DTOs — handlers take
# `payload: dict = Body(...)` and validate required fields / enum values
# manually against constants.py. Daily expiry (MEM-3) runs at hub startup
# (main.py) and at the top of GET /memories, at most once per day.

from fastapi import APIRouter, Body, Depends, HTTPException

from app import constants
from app.database.connection import get_db
from app.features.memories import repository, service
from app.middleware.dependencies import get_role, require_caregiver

router = APIRouter(tags=["memories"])

# Enum fields validated when present in a create/update payload.
_ENUM_FIELDS = {
    "category": constants.CATEGORIES,
    "importance": constants.IMPORTANCE_LEVELS,
    "trust": constants.TRUST_STATUSES,
    "validity": constants.VALIDITY_TYPES,
    "source": constants.MEMORY_SOURCES,
}


def _validate_enums(payload):
    for field, allowed in _ENUM_FIELDS.items():
        if field in payload and payload[field] is not None and payload[field] not in allowed:
            raise HTTPException(400, "{} must be one of {}".format(field, list(allowed)))


def _validate_references(conn, payload):
    """When provided (and non-null), person_id/place_id must reference an existing row."""
    for field, table in (("person_id", "people"), ("place_id", "places")):
        value = payload.get(field)
        if value and conn.execute(f"SELECT 1 FROM {table} WHERE id = ?", (value,)).fetchone() is None:
            raise HTTPException(400, f"{field} does not exist")


@router.get("/memories")
def list_memories(
    trust: str | None = None,
    category: str | None = None,
    person_id: str | None = None,
    role: str = Depends(get_role),
    conn=Depends(get_db),
):
    """List memories. A caregiver may filter by ?trust=&category=&person_id=; the patient
    only ever gets the verified, currently valid retrieval window (trust is ignored)."""
    service.run_daily_expiry(conn)
    if trust is not None and trust not in constants.TRUST_STATUSES:
        raise HTTPException(400, "trust must be one of {}".format(list(constants.TRUST_STATUSES)))
    if category is not None and category not in constants.CATEGORIES:
        raise HTTPException(400, "category must be one of {}".format(list(constants.CATEGORIES)))
    return repository.list_memories(conn, role, trust=trust, category=category, person_id=person_id)


@router.get("/memories/{memory_id}")
def get_memory(memory_id: str, role: str = Depends(get_role), conn=Depends(get_db)):
    """Get one memory. The patient only sees it if it passes the retrieval window."""
    memory = repository.get_memory(conn, memory_id, role=role)
    if memory is None:
        raise HTTPException(404, "memory not found")
    return memory


@router.post("/memories")
def create_memory(
    payload: dict = Body(...),
    caregiver: dict = Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Create a memory (caregiver only; require_caregiver already 403s the patient, so a
    patient can never write a care_safety memory). content required; enums validated;
    trust defaults 'unverified'; source defaults 'caregiver'."""
    content = payload.get("content")
    if not isinstance(content, str) or not content.strip():
        raise HTTPException(400, "content is required")
    _validate_enums(payload)
    _validate_references(conn, payload)
    data = dict(payload)
    # MEM-5: patient/ai_suggested sources are never trusted on create.
    if data.get("source") in (constants.SOURCE_PATIENT, constants.SOURCE_AI_SUGGESTED):
        data["trust"] = constants.TRUST_UNVERIFIED
    # MEM-5: care and safety information must come from a caregiver, never from the
    # patient or an AI suggestion, even when a caregiver enters it on their behalf.
    if data.get("category") == constants.CATEGORY_CARE_SAFETY and data.get("source") not in (
        None, constants.SOURCE_CAREGIVER,
    ):
        raise HTTPException(400, "care_safety memories must have source 'caregiver'")
    if data.get("trust") == constants.TRUST_VERIFIED:
        data["verified_by"] = caregiver["id"]
    memory = repository.create_memory(conn, data)
    # MEM-4: flag a conflict against an existing same-person/category/FTS match.
    service.flag_conflicts(conn, memory["id"])
    return repository.get_memory(conn, memory["id"])


@router.put("/memories/{memory_id}")
def update_memory(
    memory_id: str,
    payload: dict = Body(...),
    caregiver: dict = Depends(require_caregiver),
    conn=Depends(get_db),
):
    """Partial update (caregiver only). Editing a verified row's content/title resets it
    to unverified (MEM-2). Archiving/outdating a conflicting row tears down the conflict
    and restores the other row."""
    if "content" in payload and (not isinstance(payload["content"], str) or not payload["content"].strip()):
        raise HTTPException(400, "content must not be empty")
    _validate_enums(payload)
    _validate_references(conn, payload)
    before = conn.execute("SELECT trust, conflicts_with FROM memories WHERE id = ?", (memory_id,)).fetchone()
    if before is None:
        raise HTTPException(404, "memory not found")
    repository.update_memory(conn, memory_id, payload)
    # setting trust to verified through an edit is a verification: record who and when
    if payload.get("trust") == constants.TRUST_VERIFIED and before["trust"] != constants.TRUST_VERIFIED:
        repository.verify_memory(conn, memory_id, caregiver["id"])
    # A row being archived or outdated is leaving active use, so it is never re-flagged.
    if payload.get("validity") == constants.VALIDITY_ARCHIVED or payload.get("trust") == constants.TRUST_OUTDATED:
        if before["conflicts_with"]:
            service.clear_conflict(conn, memory_id)
    else:
        service.flag_conflicts(conn, memory_id)
    return repository.get_memory(conn, memory_id)


@router.delete("/memories/{memory_id}")
def delete_memory(memory_id: str, caregiver: dict = Depends(require_caregiver), conn=Depends(get_db)):
    """Delete a memory (admin only, enforced app-wide by enforce_access_level)."""
    if not repository.delete_memory(conn, memory_id):
        raise HTTPException(404, "memory not found")
    return {}


@router.post("/memories/{memory_id}/verify")
def verify_memory(memory_id: str, caregiver: dict = Depends(require_caregiver), conn=Depends(get_db)):
    """MEM-2: mark a memory verified. No request body."""
    memory = repository.verify_memory(conn, memory_id, caregiver["id"])
    if memory is None:
        raise HTTPException(404, "memory not found")
    return memory


@router.post("/memories/{memory_id}/resolve")
def resolve_memory_conflict(
    memory_id: str,
    payload: dict = Body(default={}),
    caregiver: dict = Depends(require_caregiver),
    conn=Depends(get_db),
):
    """MEM-4: keep this memory (-> verified) and send its conflicting partner to
    'archived' or 'outdated'. Body: {"other_outcome": "archived"|"outdated"}."""
    other_outcome = (payload or {}).get("other_outcome", constants.VALIDITY_ARCHIVED)
    row = conn.execute("SELECT id, conflicts_with FROM memories WHERE id = ?", (memory_id,)).fetchone()
    if row is None:
        raise HTTPException(404, "memory not found")
    if not row["conflicts_with"]:
        raise HTTPException(400, "memory is not in conflict")
    try:
        service.resolve_conflict(conn, memory_id, row["conflicts_with"], other_outcome, caregiver["id"])
    except ValueError as exc:
        raise HTTPException(400, str(exc))
    except LookupError:
        raise HTTPException(404, "memory not found")
    return repository.get_memory(conn, memory_id)
