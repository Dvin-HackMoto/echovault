# MODULE: Auth and Access Control

Owner: TBD

Goal:
Let a caregiver unlock caregiver mode with a PIN and keep the patient out of management functions.

Features:
- PIN hashing and checking
- PIN login endpoint
- Current caregiver lookup
- Access levels (admin, editor, viewer)

Tasks:
- [ ] AUTH-1 PIN hashing
- [ ] AUTH-2 PIN login endpoints
- [ ] AUTH-3 Access level enforcement

Dependencies:
- Hub Foundation

Definition of Done:
- A correct PIN returns the caregiver id and access level
- A wrong PIN is rejected
- The PIN is never stored or returned in plain text

## AUTH-1

MODULE FROM: Auth and Access Control
Task: PIN hashing
Owner: N/A
Goal: Fill in `features/auth/service.py` with functions to hash a PIN and check a PIN against `caregivers.pin_hash`.
Priority: P0
Dependencies: HUB-2
Acceptance Criteria:
- [ ] The same PIN hashes to a value that verifies, and a different PIN does not
- [ ] Hashes are salted, so two caregivers with the same PIN have different `pin_hash` values
- [ ] No plain PIN is written to the database or logs
Status: TODO

## AUTH-2

MODULE FROM: Auth and Access Control
Task: PIN login endpoints
Owner: N/A
Goal: Fill in `features/auth/router.py` with `POST /auth/pin` (returns caregiver id and `access_level`) and `GET /auth/me`.
Priority: P0
Dependencies: AUTH-1, HUB-4
Acceptance Criteria:
- [ ] A correct PIN returns the caregiver id, name and `access_level`
- [ ] A wrong PIN or an inactive caregiver returns 401
- [ ] `GET /auth/me` returns the caregiver for the `X-Caregiver-Id` header
Status: TODO

## AUTH-3

MODULE FROM: Auth and Access Control
Task: Access level enforcement
Owner: N/A
Goal: Make `viewer` caregivers read-only and limit destructive actions (backup import, deleting records) to `admin`.
Priority: P2
Dependencies: AUTH-2
Acceptance Criteria:
- [ ] A `viewer` gets 403 on any create, update or delete
- [ ] Only an `admin` can import a backup
- [ ] The caregiver app hides actions the current access level cannot perform
Status: TODO
