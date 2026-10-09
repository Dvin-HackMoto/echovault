# Implementation Plan: Reading Comprehension Screener — Backend

## Overview

This plan scaffolds the FastAPI backend end-to-end so the modular system (router → service → repository, Pydantic DTOs, swappable `AIClient`) runs before the AI provider is announced. The Supabase `psycopg` pool is wired for real from env config, and `ai/chatbot_client.py` ships as a deterministic stub implementing `AIClient.complete`. Tasks build up incrementally in dependency order: scaffolding → database → AI abstraction → identity → features → scoring → evaluation → scheduling/taking → learner views → reviews → dashboards → wiring, each referencing the specific requirement acceptance criteria and (where relevant) the design's correctness properties.

Target code lives under `backend/app/` per the design's folder structure. The implementation language is **Python** (as specified throughout the design document).

## Tasks

- [x] 1. Scaffold project structure, configuration, and app entry
  - [x] 1.1 Create `backend/app/` package layout and dependency manifest
    - Create `backend/app/__init__.py` and feature/subpackage `__init__.py` files for `database/`, `features/{auth,classrooms,assessments,evaluation,reviews,dashboard}/`, `ai/`, `middleware/`
    - Create `backend/requirements.txt` with `fastapi`, `uvicorn[standard]`, `pydantic`, `python-dotenv`, `psycopg[binary,pool]`, `httpx`
    - Create `backend/.env.example` documenting `DATABASE_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `CORS_ORIGINS`, `TIMEZONE` keys without values
    - _Requirements: 8.1, 8.3_

  - [x] 1.2 Implement `config.py` env settings loader
    - Load `DATABASE_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `CORS_ORIGINS`, `TIMEZONE` (default `Asia/Manila`) via `python-dotenv` / Pydantic settings
    - Abort startup with a clear error message naming the missing variable when `DATABASE_URL` or `CORS_ORIGINS` is absent or empty
    - _Requirements: 8.1, 8.2_

  - [x] 1.3 Implement `constants.py` single source of enums and weights
    - Define roles, statuses, skills, diagnosis values, verdict scoring weights (`correct=1.0`, `partial=0.5`, `missed=0.0`), and diagnosis thresholds (40, 70)
    - _Requirements: 6.1, 6.4_

  - [x] 1.4 Implement a Manila "today" date helper
    - Add a timezone-aware helper that returns the current `Asia/Manila` date, driven by `config.TIMEZONE`
    - _Requirements: 8.8_

  - [x] 1.5 Implement `main.py` FastAPI app with CORS and `/health`
    - Construct the FastAPI app, configure CORS from `CORS_ORIGINS` allowing the `X-User-Id` request header, expose unauthenticated `GET /health`
    - Leave router registration as a placeholder to be wired as features land (task 13.1)
    - _Requirements: 8.6, 8.7_

- [x] 2. Build the database layer
  - [x] 2.1 Implement `database/connection.py` psycopg pool and `get_db`
    - Create a `psycopg_pool` connection pool against `DATABASE_URL` (Supabase pooler, IPv4), wired for real from env
    - Expose a `get_db` FastAPI dependency yielding a connection/cursor
    - _Requirements: 8.3_

  - [x] 2.2 Author `database/schema.sql` DDL
    - Write full DDL for `classrooms`, `users`, `assessments`, `answers` including PKs, FKs, checks (role, status, skill, verdict, diagnosis, `learner_needs_lrn`), `unique (access_code, learner_id)`, case-insensitive teacher-name unique index, and the `assessments`/`answers` indexes
    - Enable row level security with no policies on all four tables
    - _Requirements: 8.9, 5.2, 2.3_

  - [x] 2.3 Implement `database/reset.py` drop/recreate/reseed (dev only)
    - Drop and recreate schema from `schema.sql`, then invoke the seed routine
    - _Requirements: 8.3_

  - [x] 2.4 Implement `database/seed.py` fake demo data
    - Seed per source of truth: 1 teacher "Ms. Reyes", 1 classroom, 8–10 fake learners, 2+ passages, 3 completed batches, 1–2 overrides (including one unseen correction), 1 upcoming batch, and one all-blank-answer highest_priority case
    - _Requirements: 8.3, 7.1_

- [x] 3. Build the AI abstraction (scaffolded boilerplate)
  - [x] 3.1 Implement `ai/base.py` `AIClient` interface
    - Define `class AIClient` with `complete(self, prompt: str) -> str` raising `NotImplementedError`
    - _Requirements: 8.4_

  - [x] 3.2 Implement `ai/prompts.py` evaluation prompt and JSON contract
    - Build the evaluation system rules + `build_evaluation_prompt(passage, questions)` that includes only passage and non-blank question payloads sorted by answer id, never names/LRNs/classroom names
    - Document the response contract shape (`answers[].{order,verdict,evidence}`, `evaluation`, `recommendation`)
    - _Requirements: 6.2_

  - [x] 3.3 Implement `ai/chatbot_client.py` deterministic stub and factory
    - Implement `ChatbotClient(AIClient)` whose `complete` returns a deterministic, contract-shaped placeholder (one `correct` entry per `Question:` line, evidence null), so identical input yields identical output; keep the real provider call commented as the only future edit site
    - Implement `build_ai_client()` factory reading config
    - _Requirements: 8.4, 8.5_

  - [ ]* 3.4 Write property test for stub determinism and PII-free prompts
    - **Property 5: No PII in AI prompts** — assert prompts built from seeded data contain no learner name, LRN, or classroom name
    - Assert `ChatbotClient.complete` is deterministic for identical input
    - **Validates: Requirements 6.2, 8.4**

- [x] 4. Implement identity middleware
  - [x] 4.1 Implement `middleware/dependencies.py`
    - `get_current_user` reads `X-User-Id`, loads the user, returns 401 when missing/unknown; `require_teacher` returns 403 for non-teachers
    - _Requirements: 1.6, 1.7, 1.8_

- [x] 5. Implement the auth feature
  - [x] 5.1 Define auth schemas (DTOs)
    - `LoginRequest { name?, lrn? }`, `UserOut { id, name, role, classroom_id }`
    - _Requirements: 1.1, 1.2_

  - [x] 5.2 Implement auth repository
    - SQL to match a teacher by case-insensitive name and `role='teacher'`, and to match an active learner by `learner_reference_number`
    - _Requirements: 1.1, 1.2, 1.5_

  - [x] 5.3 Implement auth service
    - Resolve login: teacher by name, learner by LRN; reject missing credentials (400), no match (401), inactive learner (401)
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [x] 5.4 Implement auth router
    - `POST /auth/login` and `GET /auth/me` (returns Current_User), mapping to `UserOut`
    - _Requirements: 1.1, 1.2, 1.6_

  - [ ]* 5.5 Write unit tests for auth service
    - Test missing-credentials, no-match, inactive-learner, teacher case-insensitive match, learner LRN match
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [x] 6. Implement the classrooms + roster feature
  - [x] 6.1 Define classroom schemas (DTOs)
    - Create-classroom, roster-bulk, bulk result (created/skipped/invalid), and student-update DTOs
    - _Requirements: 2.1, 2.3, 2.5, 2.6, 2.7_

  - [x] 6.2 Implement classrooms repository
    - SQL for insert classroom, list classrooms by teacher, insert learner, lookup LRN existence, update learner fields with `updated_at`, list active learners, and list future batches by classroom
    - _Requirements: 2.1, 2.3, 2.7, 2.9_

  - [x] 6.3 Implement classrooms service — create and student edits
    - Validate classroom name length (1–100), persist with `teacher_id`; update learner `name`/`learner_reference_number`/`classroom_id`/`is_active` setting `updated_at`; deactivate retains record and history
    - _Requirements: 2.1, 2.2, 2.7, 2.8_

  - [x] 6.4 Implement classrooms service — bulk roster parsing
    - Parse `LRN` or `LRN, Name` lines, create active learners, default name to `Learner <last 4 of LRN>`, skip existing LRNs (report skipped), skip malformed/non-12-digit entries (report invalid) without aborting the batch
    - _Requirements: 2.3, 2.4, 2.5, 2.6_

  - [x] 6.5 Implement late-joiner backfill in service
    - When a learner is added (bulk or update into a classroom), create assessment rows and answer rows for every existing batch whose `scheduled_for >= Manila_Date`
    - _Requirements: 2.9_

  - [x] 6.6 Implement classrooms router
    - `GET/POST /classrooms`, `GET/POST /classrooms/{id}/students`, `POST /classrooms/{id}/students/bulk`, `PATCH /students/{id}` (teacher-only)
    - _Requirements: 2.1, 2.3, 2.7_

  - [ ]* 6.7 Write unit tests for roster parsing and backfill
    - Test name defaulting, skip-duplicate, invalid-line handling, and backfill scope (`>= today` only)
    - _Requirements: 2.4, 2.5, 2.6, 2.9_

- [x] 7. Implement the scoring module (pure functions)
  - [x] 7.1 Implement `features/evaluation/scoring.py`
    - `final_verdict` = `COALESCE(teacher_override, ai_verdict)`; `compute_score` = `round(100 * total_points / num_questions, 1)` bounded 0.0–100.0, treating `None`/blank as missed; `compute_diagnosis` exact threshold mapping (`<40` or unoverridden blank → highest_priority; `[40,70)` → comprehension_barrier; `>=70` → on_track)
    - _Requirements: 6.1, 6.4, 5.5_

  - [ ]* 7.2 Write property test for score determinism and bounds
    - **Property 1: Score is deterministic and bounded**
    - **Validates: Requirements 6.1**

  - [ ]* 7.3 Write property test for the COALESCE final-verdict invariant
    - **Property 2: Final verdict follows the COALESCE invariant**
    - **Validates: Requirements 5.5**

  - [ ]* 7.4 Write property test for exact diagnosis mapping
    - **Property 3: Diagnosis mapping is exact and deterministic**
    - **Validates: Requirements 6.4**

  - [ ]* 7.5 Write property test for blank-answer handling in scoring
    - **Property 4: Blank answers map to missed** (scoring side — blank/None counts as missed)
    - **Validates: Requirements 6.1**

- [x] 8. Implement the evaluation feature
  - [x] 8.1 Define evaluation schemas and AI response parse/validate helpers
    - DTOs for the parsed AI response; `try_parse_and_validate(raw, expected_count)` enforcing valid JSON, exactly one entry per non-blank answer, and verdicts within the allowed set
    - _Requirements: 6.5_

  - [x] 8.2 Implement evaluation repository
    - SQL to load assessment + answers sorted by id, set per-answer `ai_verdict`/`evidence`, set assessment AI fields (`evaluation`, `recommendation`, `evaluated_by`), set `evaluation_error`, and set `comprehension_score`/`diagnosis`
    - _Requirements: 6.3, 6.5_

  - [x] 8.3 Implement evaluation service orchestration
    - Classify blanks (code sets `missed`, never sent to AI); skip AI entirely when all blank; build PII-free prompt; call AI with ~15s timeout and retry once on invalid; store evidence verbatim-or-null; write verdicts + `evaluation`/`recommendation` + `evaluated_by='ai'`; finalize score+diagnosis from final verdicts; on failure after retry set `evaluation_error` and leave `diagnosis` null writing no partial verdicts; log tokens and latency to console
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5, 6.6, 6.7_

  - [x] 8.4 Implement evaluation router — teacher retry
    - `POST /assessments/{id}/evaluate` (teacher-only) clears `evaluation_error` and re-runs evaluation synchronously
    - _Requirements: 6.5_

  - [ ]* 8.5 Write property test for blank exclusion from AI
    - **Property 4: Blank answers map to missed and are excluded from AI** (all-blank → no AI call)
    - **Validates: Requirements 6.2**

  - [ ]* 8.6 Write property test for verbatim-or-null evidence
    - **Property 7: Evidence is verbatim or null**
    - **Validates: Requirements 6.3**

  - [ ]* 8.7 Write unit test for AI-failure handling
    - **Property 10: AI failure does not stick** — invalid-twice sets `evaluation_error`, leaves `diagnosis` null, writes no partial verdicts
    - **Validates: Requirements 6.5**

- [x] 9. Checkpoint — scoring and evaluation pipeline
  - Ensure all tests pass, ask the user if questions arise.

- [x] 10. Implement scheduling and taking (assessments feature)
  - [x] 10.1 Define assessments schemas (DTOs)
    - `QuestionIn`, `CreateAssessmentRequest` (3–5 questions), `AnswerSubmission`, `SubmitRequest`, `AssessmentDetailOut`, `AnswerOut`
    - _Requirements: 5.1, 3.3_

  - [x] 10.2 Implement `generate_access_code` and scheduling repository
    - `generate_access_code(existing)` returning a unique `^[A-Z0-9]{6}$` code; SQL to read existing codes, insert assessment rows and answer rows, list active learners
    - _Requirements: 5.2_

  - [x] 10.3 Implement scheduling service
    - Validate 3–5 questions each with non-empty `question_text`, valid `skill`, non-empty `expected_ideas` (422/400 naming the field, no rows persisted on failure); assign a unique access code; create exactly one `scheduled` assessment per active learner and one answer row per question; reject classrooms with zero active learners (400)
    - _Requirements: 5.1, 5.2, 5.4, 5.6_

  - [x] 10.4 Implement taking service (start/submit)
    - Start: `scheduled` + `scheduled_for <= today` → `in_progress`; reject future-dated or already in_progress/completed leaving status unchanged. Submit: for `scheduled`/`in_progress` save answers, set `completed`/`completed_at`, enqueue a single background evaluation task; reject already-`completed` with 400 without mutating answers or `completed_at`
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5, 5.3_

  - [x] 10.5 Implement scheduling + taking router
    - `POST /assessments` (teacher, 201), `GET /classrooms/{id}/assessments`, `GET /assessments/code/{code}`, `POST /assessments/{id}/start`, `POST /assessments/{id}/submit` (202 with background eval enqueued)
    - _Requirements: 5.1, 3.1, 3.3, 3.6_

  - [ ]* 10.6 Write property test for access-code uniqueness and format
    - **Property 8: Access code is unique and well-formed**
    - **Validates: Requirements 5.2**

  - [ ]* 10.7 Write property test for single-attempt submit
    - **Property 6: Single-attempt enforcement**
    - **Validates: Requirements 5.3**

- [x] 11. Implement learner views (assessments feature)
  - [x] 11.1 Implement learner-view repository and alert query
    - SQL to load a learner's own assessment by id/access_code with answers; compute correction-alert condition (`overridden_at > corrections_seen_at`, or `corrections_seen_at IS NULL` with an existing override)
    - _Requirements: 4.1, 4.7_

  - [x] 11.2 Implement learner-view service
    - Return only the caller's own row (404 otherwise); present final verdict/evidence/score/diagnosis/evaluation/recommendation when `diagnosis` non-null and no error; report in-progress while `diagnosis` null and no error; report failed when `evaluation_error` set; set `corrections_seen_at` on acknowledge; compute correction alert
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7_

  - [x] 11.3 Implement learner-view router
    - `GET /assessments/{id}`, `GET /me/assessments` (upcoming/previous/alert), `POST /assessments/{id}/seen`
    - _Requirements: 4.1, 4.6, 4.7_

  - [ ]* 11.4 Write unit tests for evaluation-state reporting and alert logic
    - Test in-progress vs failed vs completed states and correction-alert transitions
    - _Requirements: 4.3, 4.4, 4.5, 4.7_

- [x] 12. Implement the reviews feature
  - [x] 12.1 Implement reviews repository
    - SQL to set/clear `teacher_override`/`overridden_at`/`override_note`, reload answers (final verdicts), and write recomputed score+diagnosis without touching `evaluation`/`recommendation`
    - _Requirements: 5.5, 5.7_

  - [x] 12.2 Implement reviews service
    - Validate verdict ∈ {`correct`,`partial`,`missed`} or null (else 422/400, no change); set override with `overridden_at=now()` + note, or clear override; recompute score+diagnosis from final verdicts immediately; preserve `evaluation`/`recommendation`
    - _Requirements: 5.5, 5.7_

  - [x] 12.3 Implement reviews router
    - `PATCH /answers/{id}/override` (teacher-only)
    - _Requirements: 5.5, 5.7_

  - [ ]* 12.4 Write property test for override recompute invariants
    - **Property 9: Evaluation and recommendation are never rewritten on override** (score/diagnosis change, evaluation/recommendation invariant)
    - **Validates: Requirements 5.5**

- [x] 13. Implement the dashboard feature
  - [x] 13.1 Implement dashboard repository (read-only aggregates)
    - SQL for needs-help, per-skill, most-missed-questions (group by `access_code + question_text`, ascending percent correct), override-rate, batch list, and per-student progress — all excluding inactive learners, using final verdicts (correct=1.0, partial=0.5), and resolving the default batch as the most recent batch with a completed assessment
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.6_

  - [x] 13.2 Implement dashboard service
    - Resolve target batch (explicit `access_code` or default most-recent-completed); error when the given code is missing or has no completed assessment without modifying data; enforce exclusion of inactive learners
    - _Requirements: 7.1, 7.4, 7.5, 7.6_

  - [x] 13.3 Implement dashboard router
    - `GET /classrooms/{id}/needs-help`, `/skills`, `/questions`, `/override-rate`, `/assessments`; `GET /students/{id}/progress` (teacher-only, read-only)
    - _Requirements: 7.1, 7.6_

  - [ ]* 13.4 Write property test for inactive-learner exclusion
    - **Property 11: Inactive learners are excluded while history is preserved**
    - **Validates: Requirements 7.1**

- [x] 14. Wire routers and verify end-to-end against the stub AI
  - [x] 14.1 Register all feature routers in `main.py`
    - Import and include auth, classrooms, assessments, evaluation, reviews, and dashboard routers; confirm `/docs` lists every endpoint
    - _Requirements: 8.5, 8.6_

  - [x] 14.2 Add a smoke-verification script exercising the pipeline against the stub
    - Reset+seed, then run the demo path in code (schedule → submit → background eval via stub → score/diagnose → override → recompute) asserting the pipeline completes without a live provider
    - _Requirements: 8.4, 6.6_

- [x] 15. Final checkpoint — full pipeline runs on the stub
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional and can be skipped for a faster MVP; they are the property/unit tests. Per the design, automated tests are formally out of scope for the MVP, but the scoring module and `AIClient` abstraction are built to be testable, so the property tests map directly to the design's correctness properties.
- Each task references specific requirement acceptance criteria for traceability; evaluation/scoring tasks also reference the design's numbered correctness properties.
- Layer rules are respected throughout: routers parse/map only, services hold rules, repositories hold all SQL, schemas are Pydantic DTOs; features call each other through services, never repositories.
- Boilerplate for the two unfinished dependencies is explicitly in scope: `database/connection.py` is wired for real from env, and `ai/chatbot_client.py` ships as a deterministic stub so the system runs end-to-end. When the AI provider is announced, only `chatbot_client.py` (and the cost note) changes.
- This workflow produces planning artifacts only. Begin implementation by opening `tasks.md` and clicking "Start task" next to a task item.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["1.1", "1.2", "1.3", "1.4", "3.1"] },
    { "id": 1, "tasks": ["1.5", "2.1", "3.2", "7.1"] },
    { "id": 2, "tasks": ["2.2", "3.3", "4.1", "7.2", "7.3", "7.4", "7.5"] },
    { "id": 3, "tasks": ["2.4", "3.4", "5.1", "5.2", "6.1", "8.1"] },
    { "id": 4, "tasks": ["2.3", "5.3", "6.2", "8.2"] },
    { "id": 5, "tasks": ["5.4", "6.3", "6.4", "8.3"] },
    { "id": 6, "tasks": ["5.5", "6.5", "8.4", "8.5", "8.6", "8.7", "10.1"] },
    { "id": 7, "tasks": ["6.6", "6.7", "10.2"] },
    { "id": 8, "tasks": ["10.3", "11.1", "12.1", "13.1"] },
    { "id": 9, "tasks": ["10.4", "11.2", "12.2", "13.2"] },
    { "id": 10, "tasks": ["10.5", "11.3", "12.3", "13.3"] },
    { "id": 11, "tasks": ["10.6", "10.7", "11.4", "12.4", "13.4", "14.1"] },
    { "id": 12, "tasks": ["14.2"] }
  ]
}
```
