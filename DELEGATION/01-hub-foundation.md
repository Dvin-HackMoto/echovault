# MODULE: Hub Foundation

Owner: TBD

Goal:
Get the FastAPI hub running on the laptop with a migrated, seeded SQLite database that both phones can reach over the LAN.

Features:
- Configuration from `.env`
- Shared enum constants
- SQLite connection and schema migration
- App startup, CORS, router registration
- Role detection from request headers
- Demo seed data

Tasks:
- [x] HUB-1 Config and constants
- [x] HUB-2 Database connection and schema
- [x] HUB-3 FastAPI app shell
- [x] HUB-4 Role dependencies
- [x] HUB-5 Demo seed data
- [x] HUB-6 Backend run instructions

Dependencies:
- None

Definition of Done:
- `uvicorn app.main:app --host 0.0.0.0` starts with an empty `storage/` and creates the database
- A phone on the same network gets a response from the hub
- The seeded demo patient, people, schedule, medications and memories are in the database

## HUB-1

MODULE FROM: Hub Foundation
Task: Config and constants
Owner: N/A
Goal: Fill in `app/config.py` (read `DB_PATH`, `PHOTO_DIR`, `OLLAMA_URL`, `LLM_MODEL`, `WHISPER_MODEL` from `.env`) and `app/constants.py` (categories, importance, trust, validity, medication statuses, roles).
Priority: P0
Dependencies: None
Acceptance Criteria:
- [x] Every value in `.env.example` is readable from `config.py`, with a working default when `.env` is missing
- [x] `constants.py` values match the `CHECK` constraints in the schema exactly
- [x] No other module hard-codes an enum value or a path
Status: DONE

## HUB-2

MODULE FROM: Hub Foundation
Task: Database connection and schema
Owner: N/A
Goal: Fill in `database/connection.py` (`sqlite3` connect, `row_factory = sqlite3.Row`, `get_db` dependency, `PRAGMA foreign_keys = ON` on every connection) and copy the schema from ARCHITECTURE.md into `database/schema.sql`, with a `migrate()` that runs it.
Priority: P0
Dependencies: HUB-1
Acceptance Criteria:
- [x] `migrate()` creates every table, index, trigger and `memories_fts` on an empty database
- [x] Running `migrate()` twice does not error or lose data
- [x] Inserting a memory makes it findable through `memories_fts`
- [x] A row that violates a foreign key is rejected
Status: DONE

## HUB-3

MODULE FROM: Hub Foundation
Task: FastAPI app shell
Owner: N/A
Goal: Fill in `app/main.py`: create the app, enable CORS for the phones, run `migrate()` on startup, register feature routers, serve `storage/photos/` as static files, and print the hub's LAN IP.
Priority: P0
Dependencies: HUB-2
Acceptance Criteria:
- [x] The hub starts with one command and prints the LAN address to connect to
- [x] A health endpoint returns OK from a phone on the same Wi-Fi or hotspot
- [x] A photo saved in `storage/photos/` loads by URL from a phone
- [x] `storage/` and `storage/photos/` are created if missing
Status: DONE

### Manual check (Requirements 6.7, 6.8)

Status: Passed (2 of 2 phones)

Steps:
1. From `backend/`, start the hub with `DEMO_MODE=true`: `uvicorn app.main:app --host 0.0.0.0`. Note the LAN address it prints.
2. Connect each phone to the same Wi-Fi or hotspot as the laptop.
3. On each phone, open `<LAN_Address>/health` and `<LAN_Address>/photos/seed-ana.png`.
4. Pass means the body or image appears within 10 seconds.

| Phone model | Network type (Wi-Fi/hotspot) | /health | Photo | Pass/fail |
|---|---|---|---|---|
| Oppo | Wi-Fi | OK | Loaded | Pass |
| Honor | Wi-Fi | OK | Loaded | Pass |

## HUB-4

MODULE FROM: Hub Foundation
Task: Role dependencies
Owner: N/A
Goal: Fill in `middleware/dependencies.py`: `get_role` reads `X-Role` (`patient` or `caregiver`) and `X-Caregiver-Id`; `require_caregiver` blocks patient-mode calls to write and management endpoints.
Priority: P0
Dependencies: HUB-3
Acceptance Criteria:
- [x] A request with `X-Role: patient` to a `require_caregiver` endpoint gets 403
- [x] A missing or unknown `X-Role` is rejected
- [x] A caregiver request with an unknown or inactive `X-Caregiver-Id` is rejected
Status: DONE

## HUB-5

MODULE FROM: Hub Foundation
Task: Demo seed data
Owner: N/A
Goal: Fill in `database/seed.py` with one demo patient, at least one caregiver with a known PIN, family members with photos, a daily routine, appointments, medications with times, verified memories, and the seed settings from ARCHITECTURE.md.
Priority: P0
Dependencies: HUB-2, AUTH-1
Acceptance Criteria:
- [x] Seeding runs only in demo mode and does not duplicate rows when run again
- [x] One person has `is_caregiver = 1` so the "ask Ana" fallback has a target
- [x] Seeded data includes at least one unverified, one conflicting pair and one outdated memory for the dashboard demo
- [x] Every seeded photo path points to a file that exists
Status: DONE

## HUB-6

MODULE FROM: Hub Foundation
Task: Backend run instructions
Owner: N/A
Goal: Write `backend/README.md`: install requirements, `ollama pull <model>`, copy `.env.example`, start Ollama and uvicorn, find the hub IP.
Priority: P1
Dependencies: HUB-3, AI-1
Acceptance Criteria:
- [x] A teammate can start the hub on a clean laptop by following the README only
- [x] The README states which model to pull and how to change it
- [x] The README says how to turn demo seeding on and off
Status: DONE

### Clean-laptop README run (Requirements 11.10, 11.11)

Status: Passed

A teammate who did not write the README followed only `backend/README.md` on a clean laptop, up to the `/health` check from a phone. Any step that needs outside help counts as a fail.

- Tester: RJ
- Date: 2026-10-10
- OS: Windows 11
- Pass/fail: Pass
- Steps that needed outside help: None
