# EchoVault — Modules and Tasks

Based on [PRODUCT.md](../docs/PRODUCT.md) and [ARCHITECTURE.md](../docs/ARCHITECTURE.md). File paths refer to the placeholder files already in `backend/` and `mobile/`.

## Priorities

- **P0 — Must work.** The actual demo cannot happen without it.
- **P1 — Important.** Makes the product substantially better.
- **P2 — Nice to have.** Only do it if everything else is working.

## Status values

TODO / IN PROGRESS / BLOCKED / REVIEW / DONE

## Module index

| Prefix | Module                      | Side    | Owner |
|--------|-----------------------------|---------|-------|
| HUB    | [Hub Foundation](01-hub-foundation.md)             | Backend | TBD   |
| AUTH   | [Auth and Access Control](02-auth-and-access-control.md)    | Backend | TBD   |
| PPL    | [People and Places](03-people-and-places.md)          | Backend | TBD   |
| MEM    | [Memories](04-memories.md)                   | Backend | TBD   |
| SCH    | [Schedule](05-schedule.md)                   | Backend | TBD   |
| MED    | [Medications](06-medications.md)                | Backend | TBD   |
| AI     | [AI Services](07-ai-services.md)                | Backend | TBD   |
| AST    | [Assistant](08-assistant.md)                  | Backend | TBD   |
| GAM    | [Memory Games](09-memory-games.md)               | Backend | TBD   |
| TRV    | [Trivia and Memory Prompts](10-trivia-and-memory-prompts.md)  | Backend | TBD   |
| SET    | [Settings and Dashboard](11-settings-and-dashboard.md)     | Backend | TBD   |
| BKP    | [Backup and Restore](12-backup-and-restore.md)         | Backend | TBD   |
| MOB    | [Mobile Foundation](13-mobile-foundation.md)          | Mobile  | TBD   |
| PAT    | [Patient App](14-patient-app.md)                | Mobile  | TBD   |
| REM    | [Reminders and Offline](15-reminders-and-offline.md)      | Mobile  | TBD   |
| CGV    | [Caregiver App](16-caregiver-app.md)              | Mobile  | TBD   |
| QA     | [Integration and Demo](17-integration-and-demo.md)       | Both    | TBD   |

## Open questions from the architecture

These are not covered by a file or endpoint in ARCHITECTURE.md. Each has a task in its module file that assumes an answer; confirm before starting it.

- **Places:** ~~the `places` table exists but there is no `features/places/`~~ Resolved: PPL-3 added `features/places/` with its own `/places` router (see [03-people-and-places.md](03-people-and-places.md)).
- **Patient profile:** setup step 1 creates the profile but no router lists it. SET-2 assumes `features/settings/router.py`.
- **Schedule acknowledgements:** the reminder flow posts to `schedule_acks` but no endpoint is named. SCH-3 implements `POST /schedule/{id}/ack` (see [05-schedule.md](05-schedule.md)).
- **People list:** ~~no endpoint lists people yet~~ Resolved: PPL-1 added `GET /people`. Rows are the `people` table plus `photo_url` (`/photos/<photo_path>`), as REM-2 expected.
- **Caregiver accounts:** there is no endpoint to create a caregiver. HUB-5 assumes caregivers come from `seed.py` only.
- **Flagging a wrong answer:** ~~the dashboard lists flagged answers but no endpoint sets the flag~~ Resolved: AST-6 added `POST /assistant/log/{id}/flag` (body `{"flagged": false}` clears it) and `GET /assistant/log` (see [08-assistant.md](08-assistant.md)).
- **Caregiver-written trivia:** ~~`trivia_questions.source` allows `caregiver` but no endpoint writes them~~ Resolved: TRV-3 added caregiver CRUD at `/trivia/questions` in `features/trivia/router.py` (see [10-trivia-and-memory-prompts.md](10-trivia-and-memory-prompts.md)).
- **Trivia outcomes:** the architecture saved a prompt's result to `activity_log` but named no endpoint for it. TRV-4 added `POST /trivia/result`; the patient card (PAT-8) calls it instead of `POST /games/result`.
