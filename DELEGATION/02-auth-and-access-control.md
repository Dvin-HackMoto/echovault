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
- [x] AUTH-1 PIN hashing
- [x] AUTH-2 PIN login endpoints
- [x] AUTH-3 Access level enforcement

Dependencies:
- Hub Foundation (on `main`)

Definition of Done:
- [x] A correct PIN returns the caregiver id and access level
- [x] A wrong PIN is rejected
- [x] The PIN is never stored or returned in plain text

## Running it

From `backend/`:

```
py -m pip install -r requirements.txt   # once: main needs pytest-socket and respx
py -m pytest tests/test_auth.py      # 37 tests for AUTH-1..3
py -m pytest                         # whole hub: 608 pass (13 integration tests need Ollama and Whisper, skipped)
```

Try it against a hub with the demo seed (PINs: Ana `1234` admin, Liza `5678` editor):

```
set DEMO_MODE=1
py -m uvicorn app.main:app --host 0.0.0.0 --port 8000
curl -X POST http://localhost:8000/auth/pin -H "Content-Type: application/json" -d "{\"pin\":\"1234\"}"
curl http://localhost:8000/auth/me -H "X-Role: caregiver" -H "X-Caregiver-Id: <id from the line above>"
```

Checked on a running hub with the demo seed: `1234` returns Ana (admin), `5678` returns Liza (editor), `0000` returns 401, and `/auth/me` returns the caregiver for the header.

## Contract

| Call | Who | Answer |
|------|-----|--------|
| `POST /auth/pin {pin, caregiver_id?}` | anyone (no role header needed) | **200** `{id, name, relationship, access_level}`. **401** `Wrong PIN` (also for an inactive caregiver). **409** `{message, caregivers: [{id, name}]}` when the PIN matches two caregivers; send again with `caregiver_id`. **422** no `pin` string. **429** too many wrong PINs, with `Retry-After` seconds |
| `GET /auth/me` | `X-Role: caregiver` + `X-Caregiver-Id` | **200** `{id, name, relationship, access_level}`. 401 unknown or inactive caregiver, 403 patient |

`pin_hash` is never returned. A PIN is never echoed: the body is read untyped (a malformed body cannot come back inside a validation error) and every refusal has a fixed message.

## Access levels (AUTH-3)

Enforced for **every route of every module** by one app-wide dependency, `enforce_access_level` in `app/middleware/dependencies.py`, registered in `main.create_app`. A feature module does not need to add anything to its routes.

| Request from | GET | POST / PUT / PATCH | DELETE | `POST /backup/import` |
|--------------|-----|--------------------|--------|-----------------------|
| patient | the route decides | the route decides | the route decides | 403 (`require_admin`) |
| caregiver **viewer** | yes | **403** `Viewer access is read-only` | **403** | 403 |
| caregiver **editor** | yes | yes | **403** `Only an admin can delete records` | 403 |
| caregiver **admin** | yes | yes | yes | yes |

- POSTs that change no records stay open to viewers: `/auth/pin`, `/assistant/ask`, `/assistant/voice` (`READ_ONLY_POSTS`). **A new POST that only reads must be added there.**
- An unknown or inactive caregiver id is not answered by the guard; the route's own `require_caregiver` returns 401 as before.
- Schedule and Medications (on `main`) are covered: a viewer cannot add, edit or confirm a dose, and deleting a schedule item or medicine needs an admin. The patient can still acknowledge reminders and answer doses.
- Editors who want something gone can archive it (e.g. a memory's `validity = archived`); deleting stays with the admin.

## For other modules

- **Caregiver app (CGV-1, PIN screen):** `mobile/src/api/auth.ts` has `startCaregiverSession(pin, caregiverId?)` (logs in, saves the caregiver id and role so every request carries the caregiver headers), `endCaregiverSession()` (clears them, so the PIN is needed again), `getAccessLevel()`, `refreshCaregiverSession()` (re-reads `/auth/me`; a 401 ends the session), `pinErrorMessage(err)` and `sharedPinCaregivers(err)` for the 409 case.
- **Caregiver app (hiding actions):** `mobile/src/auth/access.ts` `can(level, action)` mirrors the table above (`read`, `create`, `update`, `delete`, `export_backup`, `import_backup`). Hiding a button is for clarity only; the hub enforces the rules.
- **Whoever adds caregiver management** (create a caregiver, change a PIN): use `service.is_valid_pin(pin)` (4 to 8 digits) and store only `service.hash_pin(pin)`. Never log or return the PIN.
- **Patient app demo data (Module 14):** its in-app demo hub has no `/auth` routes yet. In demo mode the caregiver PIN screen will get 404 until they are added there.

## Decisions made (confirm or change)

- **Login by PIN alone.** The phone sends only the PIN, and the hub checks it against every active caregiver. If two caregivers share a PIN, the hub answers 409 with their names and the phone sends the PIN again with `caregiver_id`.
- **Wrong-PIN lockout.** After **5 wrong PINs in a row**, PIN login is refused for **30 seconds** (429), even for a correct PIN. A correct PIN resets the count. The count is kept for the whole hub, in memory, so restarting the hub clears it. Without this, a 4-digit PIN could be guessed over the Wi-Fi in about an hour.
- **Delete is admin only** (from the module goal). Editors can create and update.
- **App-wide guard instead of a dependency on each route**, so modules built before or after this one are covered without changes.

## AUTH-1

MODULE FROM: Auth and Access Control
Task: PIN hashing
Owner: N/A
Goal: Fill in `features/auth/service.py` with functions to hash a PIN and check a PIN against `caregivers.pin_hash`.
Priority: P0
Dependencies: HUB-2
Acceptance Criteria:
- [x] The same PIN hashes to a value that verifies, and a different PIN does not
- [x] Hashes are salted, so two caregivers with the same PIN have different `pin_hash` values
- [x] No plain PIN is written to the database or logs
Status: REVIEW (`hash_pin`/`check_pin` were added with the hub foundation for the seed; this adds `is_valid_pin`, `find_caregivers_by_pin` and the tests)

## AUTH-2

MODULE FROM: Auth and Access Control
Task: PIN login endpoints
Owner: N/A
Goal: Fill in `features/auth/router.py` with `POST /auth/pin` (returns caregiver id and `access_level`) and `GET /auth/me`.
Priority: P0
Dependencies: AUTH-1, HUB-4
Acceptance Criteria:
- [x] A correct PIN returns the caregiver id, name and `access_level`
- [x] A wrong PIN or an inactive caregiver returns 401
- [x] `GET /auth/me` returns the caregiver for the `X-Caregiver-Id` header
Status: REVIEW

## AUTH-3

MODULE FROM: Auth and Access Control
Task: Access level enforcement
Owner: N/A
Goal: Make `viewer` caregivers read-only and limit destructive actions (backup import, deleting records) to `admin`.
Priority: P2
Dependencies: AUTH-2
Acceptance Criteria:
- [x] A `viewer` gets 403 on any create, update or delete
- [x] Only an `admin` can import a backup
- [x] The caregiver app hides actions the current access level cannot perform (`can()` in `mobile/src/auth/access.ts`; the caregiver screens are CGV)
Status: REVIEW (the caregiver screens that call `can()` are built in Module 16)
