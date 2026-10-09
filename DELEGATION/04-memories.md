# MODULE: Memories

Owner: TBD

Goal:
Store personal memories with category, importance, trust and validity, and make sure only verified, currently valid ones reach the patient.

Features:
- Memory CRUD with filters
- Caregiver verification
- Automatic expiry of time-limited memories
- Conflict flagging and resolution
- Source rules for patient and AI entries

Tasks:
- [ ] MEM-1 Memory CRUD
- [ ] MEM-2 Verify endpoint
- [ ] MEM-3 Expire outdated memories
- [ ] MEM-4 Conflict flagging and resolution
- [ ] MEM-5 Source and safety rules

Dependencies:
- Hub Foundation
- Auth and Access Control
- People and Places

Definition of Done:
- A caregiver can add, edit, verify and remove a memory
- The memory lifecycle in ARCHITECTURE.md section 4 holds
- The assistant, games and trivia can query verified, valid memories

## MEM-1

MODULE FROM: Memories
Task: Memory CRUD
Owner: N/A
Goal: Fill in `features/memories/repository.py` and `router.py` with list (`?trust=&category=`), get, create, update and delete.
Priority: P0
Dependencies: HUB-4, PPL-1
Acceptance Criteria:
- [ ] Create and update validate `content` and the category, importance, trust, validity and source enums
- [ ] The list filters by `trust` and `category`
- [ ] New memories default to `trust = unverified`
- [ ] An edited memory is still found by FTS under its new text and no longer under its old text
Status: TODO

## MEM-2

MODULE FROM: Memories
Task: Verify endpoint
Owner: N/A
Goal: Add `POST /memories/{id}/verify` that sets `trust = verified`, `verified_by` and `verified_at`.
Priority: P0
Dependencies: MEM-1, AUTH-2
Acceptance Criteria:
- [ ] Only a caregiver can verify
- [ ] `verified_by` and `verified_at` are set from the request
- [ ] Editing the content of a verified memory returns it to `unverified`
Status: TODO

## MEM-3

MODULE FROM: Memories
Task: Expire outdated memories
Owner: N/A
Goal: Add `expire_outdated()` to `features/memories/service.py`, run on startup and on the first request of each day.
Priority: P1
Dependencies: MEM-1
Acceptance Criteria:
- [ ] A verified memory whose `valid_until` has passed becomes `outdated`
- [ ] Memories with no `valid_until` are untouched
- [ ] The job runs at most once per day after startup
Status: TODO

## MEM-4

MODULE FROM: Memories
Task: Conflict flagging and resolution
Owner: N/A
Goal: On save, flag a memory that has the same `person_id` and category as an existing one and a matching FTS hit; let a caregiver resolve the pair.
Priority: P1
Dependencies: MEM-2
Acceptance Criteria:
- [ ] Both rows become `conflicting` and point to each other through `conflicts_with`
- [ ] A caregiver can keep one (becomes `verified`) and send the other to `archived` or `outdated`
- [ ] Resolving clears `conflicts_with` on both rows
- [ ] Unrelated memories about the same person are not flagged
Status: TODO

## MEM-5

MODULE FROM: Memories
Task: Source and safety rules
Owner: N/A
Goal: Enforce that patient and AI-suggested entries always start `unverified`, and that `care_safety` memories can only be created by a caregiver.
Priority: P1
Dependencies: MEM-1
Acceptance Criteria:
- [ ] A patient-mode create with `category = care_safety` is rejected
- [ ] A create with `source = patient` or `ai_suggested` is stored as `unverified` whatever the payload says
- [ ] AI-suggested memories are listable with `source = ai_suggested` and `trust = unverified`
Status: TODO
