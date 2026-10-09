# MODULE: Medications

Owner: TBD

Goal:
Let caregivers set medication schedules and track each dose as unconfirmed, taken or skipped, without the system ever marking a dose taken on its own.

Features:
- Medication and dose time CRUD
- Daily generation of due doses
- Patient and caregiver confirmation

Tasks:
- [x] MED-1 Medication and time CRUD
- [x] MED-2 Daily dose log generation
- [x] MED-3 Dose confirmation

Dependencies:
- Hub Foundation (works with the minimal hub on `main` and with `feature/01-hub-foundation`; see "Integration")
- Auth and Access Control (only `require_caregiver`)

Definition of Done:
- [x] A caregiver can add a medication with one or more daily times
- [x] Today's doses exist as `unconfirmed` rows
- [x] Patient and caregiver confirmations are stored separately

## Files

| File | What it holds |
|------|---------------|
| `backend/app/features/medications/router.py` | Endpoints below. Declares `/today`, `/next` and `/logs` before `/{id}` |
| `backend/app/features/medications/service.py` | Validation, dose generation, confirmation rules, photo saving, helpers for other modules |
| `backend/app/features/medications/repository.py` | SQL for `medications`, `medication_times` and `medication_logs` |
| `backend/app/features/medications/deps.py` | **The only place Medications imports from other modules.** Imports the real HUB-1/2/4 names directly |
| `backend/app/main.py` | **Edited:** registers `medications_router` (main lists routers by hand) |
| `backend/tests/test_medications.py` | 21 tests, each run against both connection styles, plus a check that the hub app serves `/medications` (43 in total). They don't depend on the mocks |

Run the tests from `backend/` with `py -m pytest tests/test_medications.py`.

## API contract (for MOB / PAT / REM / CGV / SET)

Every request needs `X-Role`. Caregiver-only endpoints also need `X-Caregiver-Id` (the id returned by `POST /auth/pin`). Times are Manila local time: `due_at` is `YYYY-MM-DD HH:MM:SS` and `time_of_day` is `HH:MM` (24-hour).

| Method | Path | Role | Body / query | Returns |
|--------|------|------|--------------|---------|
| GET    | `/medications` | any | `?active_only=true` (patients always get active only) | list of medications, each with `times[]` and `photo_url` |
| GET    | `/medications/{id}` | any | | medication, or 404 |
| POST   | `/medications` | caregiver | see below | 201 + medication (`created_by` = the caregiver) |
| PUT    | `/medications/{id}` | caregiver | **partial**. Sending `times` replaces all times; leaving it out keeps them | medication |
| DELETE | `/medications/{id}` | caregiver | | 204 (its times and logs go too) |
| POST   | `/medications/{id}/photo` | caregiver | multipart field `photo` (JPEG/PNG/WebP) | medication with the new `photo_url` |
| GET    | `/medications/today` | any | | today's doses with status, in time order |
| GET    | `/medications/next` | any | | the medicines due at the next dose time (a list, since two can share 08:00), or `[]` |
| POST   | `/medications/logs/{log_id}` | any | `{status, note?}` | the updated dose |
| GET    | `/medications/logs` | caregiver | `?date=YYYY-MM-DD`, `?status=`, or `?overdue=true` | dose history |

**Create body:**

```json
{
  "name": "Metformin", "dose": "1 tablet", "instructions": "after breakfast",
  "start_date": "2026-10-01", "end_date": null, "is_active": true,
  "times": [{ "time_of_day": "08:00", "days": "daily" }, { "time_of_day": "20:00", "days": "MO,WE,FR" }]
}
```

`name`, `dose` and at least one time are required. `days` is `daily` (the default) or weekday codes `MO TU WE TH FR SA SU` in any case and order. They're stored upper-case and in week order.

**Dose (from `/today`, `/logs` and confirmation):** the `medication_logs` row (`id`, `medication_id`, `due_at`, `status`, `confirmed_by`, `responded_at`, `note`) plus `name`, `dose`, `instructions`, `photo_path`, `photo_url` and `time_of_day`. That's enough for PAT-6 to draw the card from one row.

**Confirmation rules (`POST /medications/logs/{log_id}`):**

| Who | May send | Stored as |
|-----|----------|-----------|
| Patient | `taken`, `skipped`. They can change their own answer | `confirmed_by = patient`, `responded_at` = now |
| Caregiver (valid `X-Caregiver-Id`) | `taken`, `skipped`, or `unconfirmed` to undo a mistake | `confirmed_by = caregiver` (`none` and `responded_at = null` for `unconfirmed`) |
| Patient, after a caregiver answered | — | **409**: the caregiver's record is not overwritten |
| `X-Role: caregiver` with a missing or unknown `X-Caregiver-Id` | — | **403** |

**Photos:** `photo_url` is `/photos/<photo_path>`, matching hub-foundation's static mount. Seeded photos (`seed-*.png`) are never deleted. A replaced photo is deleted only if this module uploaded it (`med-*`).

## Dose generation (MED-2)

- `generate_logs(conn, day)` inserts one `unconfirmed` / `confirmed_by = none` row per active time due that day. A time is due if:
  - the medication is active,
  - the day is within `start_date`…`end_date` (both inclusive, either may be empty),
  - and the time's `days` includes that weekday.
- **It runs on every request that reads doses**, not just the first one of the day. The `UNIQUE (medication_id, due_at)` constraint makes repeats cost nothing and create no duplicates. This also covers a medicine added in the middle of the day, and the hub being restarted.
- **When a medicine is edited** (times, dates, deactivated), its *untouched* doses for today are dropped and generated again. That way a moved time doesn't leave a stale dose behind. Answered doses are history and are never removed.
- Nothing in this module sets `taken` or `skipped` except `POST /medications/logs/{id}`. A test reads every endpoint and checks that every dose is still `unconfirmed`.

## For other modules

Import from `app.features.medications.service`. Each function takes the `conn` that `get_db` yields:

| Function | Returns | Use it for |
|----------|---------|------------|
| `next_doses(conn, now=None)` | medicines due at the next dose time (today or a later day) | AST `medication` template: "Your next medicine is Losartan, 1 tablet, at 8:00 PM, after dinner." |
| `today_doses(conn, now=None)` | today's doses with status | AST "did I take my medicine?", PAT-6 card, CGV-5 review |
| `overdue_doses(conn, now=None)` | unconfirmed doses past `due_at`, oldest first | SET dashboard "unconfirmed doses" |
| `repository.list_logs(conn, status="skipped")` | skipped doses | SET dashboard "skipped doses" |
| `repository.list_medications(conn, active_only=True)` | medicines with `times[]` | REM-1: schedule notifications for the next 24 h from `time_of_day` + `days` |

## Integration

Two hub foundations exist: the minimal one already on `main` (from the Settings/Dashboard work), and `feature/01-hub-foundation`. They disagree on details this module depends on. `deps.py` accepts both, so Medications works on today's `main` and keeps working when the hub branch lands.

| What Medications needs | `main` (now) | `feature/01-hub-foundation` | How Medications handles it |
|------------------------|--------------|-----------------------------|----------------------------|
| status values | `MEDICATION_STATUSES` | `MED_STATUSES` | `deps.py` accepts either name |
| `get_role` returns | `{"role", "caregiver_id"}` | `"patient"` / `"caregiver"` | read through `role_of()` |
| `require_caregiver` returns | the caregiver id | the caregiver row | read through `caregiver_id_of()` (fills `created_by`) |
| `get_db` connection | default (needs `commit()`) | autocommit | every write commits; multi-step writes use one transaction. Tests run against both modes and fail on an uncommitted write |
| router registration | listed by hand in `main.py` | automatic | `main.py` now includes `medications_router` (on the hub branch it's picked up automatically) |
| `/photos` static route | **missing** | present | `photo_url` returns 404 on `main` until HUB-3 adds the mount. Upload already works |
| caregiver check on `POST /medications/logs/{id}` | — | — | done inside the module (active `caregivers` row), because that endpoint must also accept patients |

> **Integrated on `main`.** The two hub foundations are now one, so `deps.py` imports the real names directly and `mock.py` / `dev_app.py` were deleted. `main.py` registers the router automatically and mounts `/photos`, and `GET /dashboard` now calls `generate_logs(conn)` first (step 1 below), so missed doses show up even if no phone opened the medicine card. `tests/test_hub_integration.py` covers this on the full app with the real seed. Run the whole hub with `py -m uvicorn app.main:app --host 0.0.0.0 --port 8000` (set `DEMO_MODE=true` for demo data; caregiver header `X-Caregiver-Id: seed-cg-ana`). The notes below are kept for history.

`deps.py` used to fall back to `mock.py` for a name that no foundation defined. On `main`, nothing falls back. Start the hub with `ECHOVAULT_ALLOW_MOCKS=0` and it refuses to start, naming the missing piece, if anything ever does. An error *inside* a real module is raised normally, never hidden behind mock data.

**Checked before this PR:**

- **`main` + this branch, `ECHOVAULT_ALLOW_MOCKS=0`:** all Medications tests pass (43). The rest of `main`'s suite passes except 3 `test_backup.py` tests, which fail on **Windows only** and fail identically on an untouched `main`. Backup deletes a SQLite file that's still open, which Windows forbids. Not related to this module.
- **`feature/01-hub-foundation` + these files, `ECHOVAULT_ALLOW_MOCKS=0`:** 207 tests pass, the hub's 164 plus these 43. That includes the hub's `test_no_seed_coupling`.
- **End to end on `main`'s real app with a real database file** (one connection per request, like production):
  - a caregiver created a medicine (`created_by = caregiver-demo-1`);
  - today's doses were generated;
  - a patient confirmation, read back from a fresh connection, was saved;
  - `GET /dashboard` listed the overdue dose.

**For other modules to finish the connection:**

1. **SET (dashboard):** `GET /dashboard` reads `medication_logs` directly, so today's doses only appear there once something has generated them. Add one line before its `medication_attention` query:
   ```python
   from app.features.medications.service import generate_logs
   generate_logs(conn)  # make sure today's doses exist before listing overdue ones
   ```
   Or replace that query with `overdue_doses(conn)` + `repository.list_logs(conn, status="skipped")`.
2. **HUB-3:** mount `PHOTO_DIR` at `/photos` (the hub branch already does) so `photo_url` loads on the phone.
3. **When the two hub foundations are merged together:** run `ECHOVAULT_ALLOW_MOCKS=0 py -m pytest`. Medications needs no change for either one. Then delete `mock.py` and `storage/medications_mock.db`.

**Running it alone:** from `backend/`:

```
py -m uvicorn app.features.medications.dev_app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs`. On `main` this uses the real database file (`storage/echovault.db`, git-ignored). On startup it creates the tables and runs the hub's own demo seed, and both steps are safe to repeat. Use `X-Role: patient`, or `X-Role: caregiver` with `X-Caregiver-Id: caregiver-demo-1`. Delete `storage/echovault.db` to start over. (`mock-cg-ana` applies only when no hub modules exist and the mock database is used.)

The full hub (`py -m uvicorn app.main:app`) serves the same endpoints too, but on `main` it doesn't seed demo data.

## Decisions made (confirm or change)

- **Generation runs on every dose read** instead of only the first request of the day. The result is the same and it can't miss a day (see MED-2 above).
- **A medicine created mid-day gets today's earlier doses too**, which then show as overdue. Set `start_date` to tomorrow if that's not wanted.
- **`POST /medications/logs/{id}` is the only way a dose changes status.** Patients can't undo a caregiver's record (409). Caregivers can reset a dose to `unconfirmed`.
- **`GET /medications/logs` is caregiver-only.** The patient app only needs `/today` and `/next`.
- **"Now" is fixed UTC+8 (Manila)**, the same as the Schedule module.
- **Photo upload (`POST /medications/{id}/photo`) was added** because CGV-5 needs it and no other task covers it.

## MED-1

MODULE FROM: Medications
Task: Medication and time CRUD
Owner: N/A
Goal: Fill in `features/medications/repository.py` and `router.py` with CRUD for `medications` and their `medication_times`.
Priority: P0
Dependencies: HUB-4
Acceptance Criteria:
- [x] A medication can be created with name, dose, instructions and one or more times
- [x] `time_of_day` and `days` formats are validated
- [x] Only caregivers can create, update or delete
- [x] Deleting a medication removes its times and logs
Status: REVIEW

## MED-2

MODULE FROM: Medications
Task: Daily dose log generation
Owner: N/A
Goal: Fill in `features/medications/service.py` to insert an `unconfirmed` `medication_logs` row for every active dose due today, on the first request of the day.
Priority: P1
Dependencies: MED-1
Acceptance Criteria:
- [x] Every active time due today gets exactly one log row
- [x] Running the generation again creates no duplicates
- [x] Medications outside `start_date` to `end_date`, inactive, or not due on that weekday are skipped
Status: REVIEW

## MED-3

MODULE FROM: Medications
Task: Dose confirmation
Owner: N/A
Goal: Add `POST /medications/logs/{id}` to set `taken` or `skipped`, plus a list of today's doses with their status.
Priority: P1
Dependencies: MED-2
Acceptance Criteria:
- [x] A patient confirmation stores `confirmed_by = patient` and `responded_at`
- [x] A caregiver can confirm or correct a dose, stored as `confirmed_by = caregiver`
- [x] No code path sets `taken` without an explicit request
- [x] Doses still `unconfirmed` past `due_at` are queryable for the dashboard
Status: REVIEW
