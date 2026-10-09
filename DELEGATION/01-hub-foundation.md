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
- [ ] HUB-1 Config and constants
- [ ] HUB-2 Database connection and schema
- [ ] HUB-3 FastAPI app shell
- [ ] HUB-4 Role dependencies
- [ ] HUB-5 Demo seed data
- [ ] HUB-6 Backend run instructions

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
- [ ] Every value in `.env.example` is readable from `config.py`, with a working default when `.env` is missing
- [ ] `constants.py` values match the `CHECK` constraints in the schema exactly
- [ ] No other module hard-codes an enum value or a path
Status: TODO

## HUB-2

MODULE FROM: Hub Foundation
Task: Database connection and schema
Owner: N/A
Goal: Fill in `database/connection.py` (`sqlite3` connect, `row_factory = sqlite3.Row`, `get_db` dependency, `PRAGMA foreign_keys = ON` on every connection) and copy the schema from ARCHITECTURE.md into `database/schema.sql`, with a `migrate()` that runs it.
Priority: P0
Dependencies: HUB-1
Acceptance Criteria:
- [ ] `migrate()` creates every table, index, trigger and `memories_fts` on an empty database
- [ ] Running `migrate()` twice does not error or lose data
- [ ] Inserting a memory makes it findable through `memories_fts`
- [ ] A row that violates a foreign key is rejected
Status: TODO

## HUB-3

MODULE FROM: Hub Foundation
Task: FastAPI app shell
Owner: N/A
Goal: Fill in `app/main.py`: create the app, enable CORS for the phones, run `migrate()` on startup, register feature routers, serve `storage/photos/` as static files, and print the hub's LAN IP.
Priority: P0
Dependencies: HUB-2
Acceptance Criteria:
- [ ] The hub starts with one command and prints the LAN address to connect to
- [ ] A health endpoint returns OK from a phone on the same Wi-Fi or hotspot
- [ ] A photo saved in `storage/photos/` loads by URL from a phone
- [ ] `storage/` and `storage/photos/` are created if missing
Status: TODO

## HUB-4

MODULE FROM: Hub Foundation
Task: Role dependencies
Owner: N/A
Goal: Fill in `middleware/dependencies.py`: `get_role` reads `X-Role` (`patient` or `caregiver`) and `X-Caregiver-Id`; `require_caregiver` blocks patient-mode calls to write and management endpoints.
Priority: P0
Dependencies: HUB-3
Acceptance Criteria:
- [ ] A request with `X-Role: patient` to a `require_caregiver` endpoint gets 403
- [ ] A missing or unknown `X-Role` is rejected
- [ ] A caregiver request with an unknown or inactive `X-Caregiver-Id` is rejected
Status: TODO

## HUB-5

MODULE FROM: Hub Foundation
Task: Demo seed data
Owner: N/A
Goal: Fill in `database/seed.py` with one demo patient, at least one caregiver with a known PIN, family members with photos, a daily routine, appointments, medications with times, verified memories, and the seed settings from ARCHITECTURE.md.
Priority: P0
Dependencies: HUB-2, AUTH-1
Acceptance Criteria:
- [ ] Seeding runs only in demo mode and does not duplicate rows when run again
- [ ] One person has `is_caregiver = 1` so the "ask Ana" fallback has a target
- [ ] Seeded data includes at least one unverified, one conflicting pair and one outdated memory for the dashboard demo
- [ ] Every seeded photo path points to a file that exists
Status: TODO

## HUB-6

MODULE FROM: Hub Foundation
Task: Backend run instructions
Owner: N/A
Goal: Write `backend/README.md`: install requirements, `ollama pull <model>`, copy `.env.example`, start Ollama and uvicorn, find the hub IP.
Priority: P1
Dependencies: HUB-3, AI-1
Acceptance Criteria:
- [ ] A teammate can start the hub on a clean laptop by following the README only
- [ ] The README states which model to pull and how to change it
- [ ] The README says how to turn demo seeding on and off
Status: TODO
