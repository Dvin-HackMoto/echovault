# MODULE: Schedule

Owner: TBD

Goal:
Store appointments, routines, meals and visits as structured records and answer "what is today" and "what is next".

Features:
- Schedule item CRUD
- Recurrence expansion
- Today and next endpoints
- Reminder acknowledgements

Tasks:
- [x] SCH-1 Schedule item CRUD
- [x] SCH-2 Recurrence, today and next
- [x] SCH-3 Reminder acknowledgements

Dependencies:
- Hub Foundation (mocked until HUB-1, HUB-2, HUB-4 land; see "Mocks and how to connect")
- People and Places (only the `people` / `places` tables, for linking and names)

Definition of Done:
- [x] A caregiver can create one-off and recurring items
- [x] `GET /schedule/today` and `GET /schedule/next` return correct occurrences
- [x] An acknowledgement is recorded without being treated as proof the activity happened

## Files

| File | What it holds |
|------|---------------|
| `backend/app/features/schedule/router.py` | Endpoints below. Declares `/today` and `/next` before `/{id}` |
| `backend/app/features/schedule/service.py` | Payload validation, recurrence expansion, `today()`, `next_occurrence()`, `acknowledge()` |
| `backend/app/features/schedule/repository.py` | `schedule_items` / `schedule_acks` SQL. Items are joined with person and place names |
| `backend/app/features/schedule/deps.py` | **The only place Schedule imports from other modules.** Imports the real HUB-1/2/4 names directly |
| `backend/tests/test_schedule.py` | 22 tests covering every acceptance criterion below. They don't depend on the mocks |

Run the tests from `backend/` with `py -m pytest tests/test_schedule.py`. `pytest` has been added to `requirements.txt`.

## API contract (for MOB / PAT / REM / CGV)

All endpoints need the `X-Role` header. Writes need `X-Role: caregiver`. Times are Manila local time in the form `YYYY-MM-DD HH:MM:SS`. Input may also be `YYYY-MM-DD HH:MM` or ISO with a `T`, and it is normalized.

| Method | Path | Role | Body / query | Returns |
|--------|------|------|--------------|---------|
| GET    | `/schedule` | any | `?kind=meal&active_only=true` | list of items |
| GET    | `/schedule/{id}` | any | | item, or 404 |
| POST   | `/schedule` | caregiver | item fields | 201 + item |
| PUT    | `/schedule/{id}` | caregiver | **partial**: only the fields to change | item |
| DELETE | `/schedule/{id}` | caregiver | | 204 (its acks are deleted too) |
| GET    | `/schedule/today` | any | optional `?date=YYYY-MM-DD` (caregiver preview) | list of occurrences in time order |
| GET    | `/schedule/next` | any | | one occurrence, or `null` |
| POST   | `/schedule/{id}/ack` | any | `{occurrence_at, response}` | the ack row |

**Item fields:** `title`\*, `kind`\* (`appointment|routine|meal|visit|activity`), `starts_at`\* (first occurrence), `duration_min`, `recurrence`, `ends_on` (`YYYY-MM-DD`, inclusive), `person_id`, `place_id`, `notes`, `remind_before_min` (default 30), `is_quiet_period` (default 0), `is_active` (default 1). Responses also include `id`, `updated_at`, `person_name`, `person_relationship`, `person_photo_path` and `place_name`.

**Occurrence** = item fields plus:

```json
{
  "occurrence_at": "2026-10-10 15:00:00",
  "ends_at": "2026-10-10 17:00:00",
  "remind_at": "2026-10-10 14:30:00",
  "ack": { "response": "snoozed", "responded_at": "2026-10-10 14:31:02", "...": "..." }
}
```

`ends_at` is null when there is no `duration_min`. `ack` is null until the patient responds. `remind_at` is the time REM-1 should use for the local notification.

**Validation errors** return 422 with a readable `detail`. An unknown `person_id` or `place_id` also returns 422.

## Recurrence rules

| `recurrence` | Occurs on |
|--------------|-----------|
| empty / null | only the date of `starts_at` |
| `daily` | every day |
| `weekly:MO,WE` | listed weekdays (`MO TU WE TH FR SA SU`, case-insensitive; stored upper-case and in order) |
| `monthly:15` | that day of each month. `29`–`31` fall on the last day of shorter months, so a reminder is never silently skipped |

Every occurrence uses the time of day from `starts_at`. Occurrences fall on or after the `starts_at` date and on or before `ends_on`. Items with `is_active = 0` never produce occurrences.

**For other modules:** don't parse recurrence again. Import from `app.features.schedule.service`:

| Function (in `service.py`) | Returns | Use it for |
|----------------------------|---------|------------|
| `today(conn, day=None)` | that day's occurrences with acks, in time order | AST `next_event` ("what's today"), PAT home |
| `next_occurrence(conn, now=None)` | the next occurrence, or `None` | AST `next_event` ("what's next") |
| `occurrences_between(conn, start, end)` | occurrences that **overlap** the window, including ones already running | TRV-2: `occurrences_between(conn, now - 30 min, now + 30 min)` is non-empty means don't prompt. Also check `is_quiet_period` on the results |
| `occurrences_on(items, day)` + `repository.list_items(conn, kind="routine", active_only=True)` | expansion without the database | GAM `routine_recall` (routine items in time order) |
| `manila_now()` | the current Manila time as a naive datetime | anything that compares with schedule times |

All of them take the same `conn` that `get_db` yields, so other modules don't need anything extra.

## Integration: what other modules need to do

Hub Foundation and Auth are still placeholders. `deps.py` looks up each name below in its real module. If the module **defines** it, the real one is used. If not, the mock from `mock.py` is used and a `UserWarning` names what's missing. An error *inside* a real module is **not** hidden: it's raised normally, so a broken real module can't silently fall back to mock data.

| Name | Real home (owner) | What Schedule expects from it | Mock until then |
|------|-------------------|------------------------------|-----------------|
| `SCHEDULE_KINDS`, `ACK_RESPONSES` | `app/constants.py` (HUB-1) | **exactly these names**, holding the same values as the schema `CHECK`s | tuples with those values |
| `get_db` | `app/database/connection.py` (HUB-2) | a FastAPI dependency that yields a `sqlite3` connection with `row_factory = sqlite3.Row`. Schedule calls `conn.commit()` itself | a separate `storage/schedule_mock.db` (built from the real `schema.sql` once it exists), pre-filled with the demo week |
| `get_role`, `require_caregiver` | `app/middleware/dependencies.py` (HUB-4) | FastAPI dependencies that raise to block a request. Their return values are not used, so any shape is fine | `X-Role` checks only; `X-Caregiver-Id` is ignored |

> **Integrated on `main`.** The hub foundation is merged: `deps.py` imports the real names, `main.py` registers the router automatically, and `database/seed.py` seeds the demo week itself, so `mock.py`, `dev_app.py` and `demo.py` were deleted. `tests/test_schedule.py` runs against the real schema and role checks, and `tests/test_hub_integration.py` runs Schedule, Medications and the dashboard together on the full app. Run the whole hub with `py -m uvicorn app.main:app --host 0.0.0.0 --port 8000` (set `DEMO_MODE=true` for demo data). The checklist below is kept for history.

**Checklist to finish integration** (done):

1. **HUB-1, HUB-2, HUB-4:** define the names above. Schedule switches over automatically.
2. **HUB-2:** make sure `schema.sql` contains `schedule_items` and `schedule_acks` exactly as in ARCHITECTURE.md.
3. **HUB-3:** in `main.py`:
   ```python
   from app.features.schedule.router import router as schedule_router
   app.include_router(schedule_router)
   ```
4. **HUB-5:** in `seed.py`, after seeding people and places:
   ```python
   from app.features.schedule.demo import seed_demo_schedule
   seed_demo_schedule(conn, person_id=<Ana's id>, place_id=<church id>)
   ```
5. **Check:** start the hub with `ECHOVAULT_ALLOW_MOCKS=0`. If anything is still missing, it fails at startup and names the missing piece instead of running on mocks.
6. **Clean up:** delete `mock.py`, `dev_app.py` and `storage/schedule_mock.db`. In `tests/test_schedule.py`, the `schema_sql()` fallback branch becomes unused and can be removed.

This was checked before the PR: in a copy of the backend with stand-in HUB-1/2/4 files, `mock.py` deleted and `ECHOVAULT_ALLOW_MOCKS=0`, all 22 tests passed. The router wrote to the real database file and enforced the real `X-Caregiver-Id` check.

**Running it before the hub exists:** the mobile team can start the Schedule API alone from `backend/`:

```
py -m uvicorn app.features.schedule.dev_app:app --host 0.0.0.0 --port 8000
```

Open `http://localhost:8000/docs` to try every endpoint. Delete `storage/schedule_mock.db` to reset the demo data.

## Decisions made (confirm or change)

- **Ack endpoint** is `POST /schedule/{id}/ack` (README open question). Any role may post.
- **`occurrence_at` must be a real occurrence** of the item (correct date and time), otherwise 422. REM-3 should drop a queued ack that gets a 4xx, for example when a caregiver changed the time while the phone was offline.
- **`PUT` is partial.** Missing fields keep their saved values, and the merged item is validated as a whole.
- **"Now" is fixed UTC+8 (Manila)** whatever the laptop's time zone is. `next` returns occurrences at or after now, so an item already in progress is not "next".
- **Delete is a hard delete.** To hide an item but keep its history, set `is_active = false`.

## SCH-1

MODULE FROM: Schedule
Task: Schedule item CRUD
Owner: N/A
Goal: Fill in `features/schedule/repository.py` and `router.py` with list, get, create, update and delete for `schedule_items`.
Priority: P0
Dependencies: HUB-4
Acceptance Criteria:
- [x] Create and update validate `title`, `kind`, `starts_at` and the recurrence string format
- [x] Items can link to a person and a place
- [x] Write endpoints use `require_caregiver`
Status: REVIEW (role check is mocked until HUB-4)

## SCH-2

MODULE FROM: Schedule
Task: Recurrence, today and next
Owner: N/A
Goal: Expand `daily`, `weekly:MO,WE` and `monthly:15` recurrence in Python and add `GET /schedule/today` and `GET /schedule/next`.
Priority: P0
Dependencies: SCH-1
Acceptance Criteria:
- [x] `today` returns every active occurrence for the current Manila date, in time order
- [x] `next` returns the nearest future occurrence, including one on a later day
- [x] Items past `ends_on` or with `is_active = 0` are left out
- [x] One-off items appear only on their own date
Status: REVIEW

## SCH-3

MODULE FROM: Schedule
Task: Reminder acknowledgements
Owner: N/A
Goal: Add an endpoint (assumed `POST /schedule/{id}/ack`) that writes `acknowledged`, `dismissed` or `snoozed` to `schedule_acks` for one occurrence.
Priority: P1
Dependencies: SCH-2
Acceptance Criteria:
- [x] The patient can post an acknowledgement for a specific `occurrence_at`
- [x] A second response for the same occurrence updates the first instead of failing
- [x] `today` shows each occurrence's latest response
Status: REVIEW
