# Implementation Plan: Reading Comprehension Game

## Overview

This plan builds the platform bottom-up. The greenfield FastAPI backend comes first: project scaffolding and SQLAlchemy data layer, then the pure validator logic (V1/V3/V4/V5) with property tests placed next to the code they verify, then the Anthropic-dependent pieces (Pack_Generator, V2/V6), then the live Session_Manager + WebSocket hub, Analytics_Module, and REST wiring. The React frontend is built after the backend contracts exist: routing + state store + Vitest/RTL setup, then OCR upload and passage review, pack status, host/join/play views, analytics, and the accessibility layer. Property-based tests (pytest + Hypothesis) accompany the pure backend logic; example/integration tests cover external services, WebSockets, and UI.

Backend lives in `backend/` (expanding `backend/main.py`). Frontend lives in `frontend/my-react-app`.

## Tasks

- [ ] 1. Backend project scaffolding and configuration
  - Create `backend/` package layout (app module, `requirements.txt`/`pyproject.toml`) with FastAPI, uvicorn, SQLAlchemy, anthropic, textstat, pytest, hypothesis
  - Add `DATABASE_URL`-driven engine/session configuration so SQLite↔Postgres switches without model or call-site changes
  - Add a FastAPI app factory and health route; configure pytest + Hypothesis (min 100 iterations)
  - _Requirements: 7.3_

- [ ] 2. Data layer: SQLAlchemy models and repository with rollback
  - [ ] 2.1 Define ORM models
    - Implement `Base`, `User`, `QuestionPack`, `Question`, `SessionResult`, `Response`, `SkillAnalytics` with relationships and FKs per design
    - Create metadata/tables on startup against the configured engine
    - _Requirements: 7.1, 7.3_

  - [ ] 2.2 Implement repository layer with atomic transactions
    - Provide session factory and a `persist_atomic(write_fn)` helper that commits on success and rolls back on any exception, raising `PersistenceError` while leaving no partial record
    - Add CRUD/read-back functions for each entity (fetch pack, save pack, save session results, save/read analytics)
    - _Requirements: 7.1, 7.3, 7.4_

  - [ ]* 2.3 Write property test for persistence round-trip
    - **Property 17: Persistence round-trip survives restart** — write each valid entity, read back through a fresh connection, assert equality
    - **Validates: Requirements 7.1**

  - [ ]* 2.4 Write property test for rollback atomicity
    - **Property 18: Write failures roll back atomically** — inject a mid-write failure, assert no records remain and `PersistenceError` is raised with in-memory data retained
    - **Validates: Requirements 7.4**

- [ ] 3. Core domain types and skill configuration
  - Define `QuestionPack`/`Question`/`Option`/`SkillConfig` dataclasses used by the pipeline, plus `ValidatorResult`, `PipelineOutcome`, and the `Validator` protocol
  - Define the targeted `Comprehension_Skill` set/config structure
  - _Requirements: 3.1_

- [ ] 4. Validator Pipeline — pure validators (V1, V3, V4-duplicate, V5)
  - [ ] 4.1 Implement V1 structural validator
    - Verify valid JSON, all schema-required fields present and non-empty, 1–50 MCQs, exactly one correct option per MCQ
    - _Requirements: 3.2_

  - [ ]* 4.2 Write property test for V1
    - **Property 6: V1 structural validity** — pass iff valid JSON, non-empty required fields, 1–50 MCQs, exactly one correct option each
    - **Validates: Requirements 3.2**

  - [ ] 4.3 Implement V3 reading-level validator
    - Compute Flesch-Kincaid Grade Level via `textstat` for the passage and each question; pass iff all in [5.0, 6.9] inclusive
    - _Requirements: 3.4_

  - [ ]* 4.4 Write property test for V3
    - **Property 7: V3 reading-level banding** — pass iff FK grade of passage and every question lies in [5.0, 6.9]; cover 5.0 and 6.9 boundaries
    - **Validates: Requirements 3.4**

  - [ ] 4.5 Implement V4 duplicate-option check (pure part)
    - Trim whitespace and compare case-insensitively; fail if any MCQ has duplicate options; enforce at most one option flagged correct
    - _Requirements: 3.5_

  - [ ]* 4.6 Write property test for V4 duplicate check
    - **Property 8: V4 option uniqueness** — pass iff trimmed/case-insensitive options are all distinct and at most one flagged correct
    - **Validates: Requirements 3.5**

  - [ ] 4.7 Implement V5 skill-coverage validator
    - Pass iff every question is tagged with ≥1 skill drawn from the configured targeted set
    - _Requirements: 3.6_

  - [ ]* 4.8 Write property test for V5
    - **Property 9: V5 skill coverage** — pass iff every question carries at least one configured targeted skill
    - **Validates: Requirements 3.6**

- [ ] 5. Validator Pipeline — Anthropic-backed validators (V2, V4 entailment, V6)
  - [ ] 5.1 Implement an Anthropic client wrapper
    - Wrap the Anthropic SDK for entailment and safety prompts with timeout handling; make injectable/mockable
    - _Requirements: 3.3, 3.7_

  - [ ] 5.2 Implement V2 grounding validator
    - Use the entailment check so each correct answer is entailed/inferable from the passage; fail if any answer relies on absent facts
    - _Requirements: 3.3_

  - [ ] 5.3 Implement V4 entailment part and V6 safety validator
    - V4: at most one option entailed as correct via Anthropic; V6: Grade 5–6 safety + topic relevance, failing on any flagged content
    - _Requirements: 3.5, 3.7_

  - [ ]* 5.4 Write example/integration tests for V2, V4-entailment, V6 with mocked SDK
    - Cover pass and fail paths with stubbed Anthropic responses (absent-fact answer, flagged content)
    - _Requirements: 3.3, 3.5, 3.7_

- [ ] 6. Assemble and run the ordered pipeline
  - [ ] 6.1 Implement `run_pipeline` orchestration
    - Build the fixed V1→V6 ordered list; short-circuit on first failure recording `(validator_id, reason)`; mark playable only when all pass
    - _Requirements: 3.1, 3.8_

  - [ ]* 6.2 Write property test for pipeline ordering and short-circuit
    - **Property 5: Playability equals all validators passing, in order, short-circuited** — playable iff all six pass; evaluation order fixed; first failing Vk recorded with reason and nothing after Vk evaluated
    - **Validates: Requirements 2.4, 3.1, 3.8**

- [ ] 7. Checkpoint — validator and data layer
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Pack_Generator
  - [ ] 8.1 Implement passage length gate and generation request
    - Reject passages outside 100–10,000 chars with a length validation error before any Claude call; otherwise request a 6–12 question pack over targeted skills
    - _Requirements: 2.1, 2.2, 2.3_

  - [ ] 8.2 Implement 30s/3-retry generation policy
    - Enforce 30-second timeout; permit retry iff fewer than 3 attempts made for the submission; parse response into the pack type and hand to the pipeline
    - _Requirements: 2.4, 2.6_

  - [ ]* 8.3 Write property test for passage length gate
    - **Property 3: Passage length gate** — generation attempted iff length in [100, 10000]; else no request and a length error; cover 99/100 and 10000/10001 edges
    - **Validates: Requirements 2.1, 2.2**

  - [ ]* 8.4 Write property test for bounded retries
    - **Property 4: Generation retries bounded at three** — retry permitted iff fewer than 3 attempts already made for the submission
    - **Validates: Requirements 2.6**

- [ ] 9. Session_Manager and WebSocket hub
  - [ ] 9.1 Implement in-memory session state and join-code issuance
    - Create `GameSession`/`Participant` state; generate unique 4–8 alphanumeric join codes among active sessions
    - _Requirements: 4.1_

  - [ ]* 9.2 Write property test for join codes
    - **Property 10: Join codes are well-formed and unique among active sessions** — each code is 4–8 alphanumeric and distinct from every active session's code
    - **Validates: Requirements 4.1**

  - [ ] 9.3 Implement join/rejoin with capacity and distinct rejections
    - Accept join when code matches active session with <40 participants; reject "session_full" at exactly 40 and "invalid_code" when no match; rejoin reattaches to the same participant preserving answers while active
    - _Requirements: 4.2, 4.7, 4.8_

  - [ ]* 9.4 Write property test for join outcomes
    - **Property 11: Join outcome by code validity and capacity** — accept / "session full" / "invalid code" with full and invalid distinguishable; cover exactly-40 boundary
    - **Validates: Requirements 4.2, 4.8**

  - [ ]* 9.5 Write property test for rejoin state preservation
    - **Property 14: Rejoin preserves participant state** — rejoin while active reattaches the same participant and preserves recorded answers
    - **Validates: Requirements 4.7**

  - [ ] 9.6 Implement question advance/broadcast and answer acceptance
    - Broadcast the current question to every connected participant on advance (no correctness flags); accept an answer iff it targets the current question and no prior answer exists; reject otherwise retaining prior answer
    - _Requirements: 4.3, 4.4, 4.5_

  - [ ]* 9.7 Write property test for broadcast completeness
    - **Property 12: Question broadcast reaches every connected participant** — on advance, every connected participant receives exactly the current question
    - **Validates: Requirements 4.3**

  - [ ]* 9.8 Write property test for answer acceptance and idempotent retention
    - **Property 13: Answer acceptance and idempotent retention** — accept iff current question and no prior answer; rejected submissions never overwrite a recorded answer
    - **Validates: Requirements 4.4, 4.5**

  - [ ] 9.9 Implement WebSocket endpoint and session-end persistence
    - Wire `/ws/sessions/{join_code}` to the JSON envelope contract (join/advance/answer/end ↔ joined/join_rejected/question/answer_ack/answer_rejected/session_ended); on end, persist results via the repository
    - _Requirements: 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 4.8_

  - [ ]* 9.10 Write integration tests for WebSocket flows
    - Exercise join/advance/answer/rejoin/end over a test WebSocket client with distinct rejection reasons
    - _Requirements: 4.2, 4.3, 4.6, 4.7, 4.8_

- [ ] 10. Analytics_Module
  - [ ] 10.1 Implement per-skill aggregation and proportions
    - Aggregate persisted responses by tagged skill; total = responses per skill, correct = matches of correct answer; proportion = correct/total rounded to 2 dp in [0.0, 1.0]; zero-response skills record total 0 and no proportion; persist analytics
    - _Requirements: 5.1, 5.2, 5.3, 5.6_

  - [ ]* 10.2 Write property test for analytics aggregation
    - **Property 15: Per-skill analytics aggregation and proportion** — totals/correct counts, rounded proportion in range with correct≤total, and zero-response skills with no proportion; cover empty skill buckets
    - **Validates: Requirements 5.1, 5.2, 5.3**

- [ ] 11. REST API wiring
  - [ ] 11.1 Implement pack generation and regeneration endpoints
    - `POST /api/packs/generate` (length error, generation, pipeline, validator rejection with `{validator, reason}`, persist on playable within 5s); `POST /api/packs/{pack_id}/regenerate` (max 3 per submission)
    - _Requirements: 2.1, 2.2, 2.4, 2.5, 2.6, 3.8, 3.9, 7.2_

  - [ ] 11.2 Implement pack fetch, session create, and analytics endpoints
    - `GET /api/packs/{pack_id}`; `POST /api/sessions` (returns join code); `GET /api/sessions/{session_id}/analytics` (no-data message when none persisted)
    - _Requirements: 4.1, 5.4, 5.5, 7.1_

  - [ ]* 11.3 Write integration tests for REST endpoints with mocked generation
    - Cover length error, validator rejection payload, playable persistence, session creation, and empty-analytics message
    - _Requirements: 2.2, 3.9, 4.1, 5.5_

- [ ] 12. Checkpoint — backend complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 13. Frontend foundation: router, state store, and test setup
  - [ ] 13.1 Add React Router, state store, and REST/WebSocket clients
    - Install and configure React Router with routes for upload, review, pack status, host, join, play, analytics; add a Zustand store for session state and a typed REST/WS client
    - _Requirements: 4.1, 4.2_

  - [ ] 13.2 Set up Vitest + React Testing Library
    - Install and configure Vitest + RTL + jsdom; add a sample passing test and npm scripts (`vitest --run`)
    - _Requirements: 2.1_

- [ ] 14. Photo upload and in-browser OCR
  - [ ] 14.1 Implement `PhotoUpload` with Tesseract.js
    - Client-side format (PNG/JPEG/WebP) and ≤10 MB validation retaining prior text on reject; run Tesseract.js in-browser emitting 0–100 progress; handle zero-text, extraction failure (retain photo + retry), and transmit only extracted text
    - _Requirements: 1.1, 1.2, 1.3, 1.5, 1.6, 1.7, 1.8_

  - [ ]* 14.2 Write property test for file acceptance
    - **Property 2: File acceptance equals allowed type and size** — accepted iff PNG/JPEG/WebP and ≤10 MB; rejection leaves prior extracted text unchanged
    - **Validates: Requirements 1.5, 1.6**

  - [ ]* 14.3 Write property test for OCR progress monotonicity
    - **Property 1: OCR progress stays within bounds and never regresses** — mapped progress values stay in [0, 100] and are non-decreasing
    - **Validates: Requirements 1.3**

  - [ ]* 14.4 Write component tests for upload states
    - Mock Tesseract.js to test progress, zero-text message, failure+retry, and unsupported-format/oversize errors
    - _Requirements: 1.5, 1.6, 1.7, 1.8_

- [ ] 15. Passage review and pack status
  - [ ] 15.1 Implement `PassageReview`
    - Editable extracted-text field; submit text to `POST /api/packs/generate`
    - _Requirements: 1.4, 2.1_

  - [ ] 15.2 Implement `PackStatus`
    - Show generation state, validator failure identifier + reason, and a regenerate control
    - _Requirements: 2.5, 2.6, 3.9_

  - [ ]* 15.3 Write component tests for review and status
    - Edit-and-submit flow; render validator failure `{validator, reason}` and regenerate action
    - _Requirements: 1.4, 3.9_

- [ ] 16. Live session views: host, join, play
  - [ ] 16.1 Implement `HostConsole`
    - Create session, display join code, advance questions, end session, and link to analytics over the WebSocket client
    - _Requirements: 4.1, 4.3, 4.6, 5.4_

  - [ ] 16.2 Implement `JoinScreen`
    - Enter join code; handle `invalid_code` vs `session_full` distinctly; rejoin on reconnect using `participant_id`
    - _Requirements: 4.2, 4.7, 4.8_

  - [ ] 16.3 Implement `PlayView`
    - Render the current question, submit an answer, and show accept/reject feedback without correctness leakage
    - _Requirements: 4.4, 4.5_

  - [ ]* 16.4 Write component tests for play accept/reject and join errors
    - Mock the WS client to assert answer accept/reject and distinct join rejections
    - _Requirements: 4.5, 4.8_

- [ ] 17. Analytics view
  - [ ] 17.1 Implement `AnalyticsView`
    - Per-skill table (skill name, total, correct, proportion); show no-data message when none available
    - _Requirements: 5.4, 5.5_

  - [ ]* 17.2 Write component tests for analytics table
    - Render populated table and the no-analytics message
    - _Requirements: 5.4, 5.5_

- [ ] 18. Accessibility layer
  - [ ] 18.1 Implement `AccessibilityProvider`
    - Context holding a11y settings; apply changes to the current view within 1s without ending the session
    - _Requirements: 6.4_

  - [ ] 18.2 Implement `ListenButton`
    - Web Speech API `SpeechSynthesis` playback of displayed passage/question; on unavailability, show a message and keep text visible
    - _Requirements: 6.1, 6.5_

  - [ ] 18.3 Implement `LeveledTextControl`
    - Reading-level selector spanning at least one band below and above Grade 5–6; fetch variant with retry; on failure show message, retain prior text, allow retry
    - _Requirements: 6.2, 6.6_

  - [ ] 18.4 Implement `ReadingDisplaySettings`
    - Dyslexia-friendly font, line spacing ≥1.5×, char spacing ≥0.12×, and contrast settings each ≥4.5:1
    - _Requirements: 6.3_

  - [ ]* 18.5 Write property test for contrast threshold
    - **Property 16: Reading-friendly contrast threshold** — every selectable contrast setting yields a text-to-background ratio ≥ 4.5:1
    - **Validates: Requirements 6.3**

  - [ ]* 18.6 Write component tests for accessibility behaviors
    - Mock `SpeechSynthesis` for playback and unavailable fallback; test leveled-text retry and setting-apply-within-1s without session end
    - _Requirements: 6.1, 6.4, 6.5, 6.6_

- [ ] 19. Final checkpoint — end-to-end wiring
  - Ensure all tests pass, ask the user if questions arise.

## Notes

- Tasks marked with `*` are optional (test-focused or nice-to-have) and can be skipped for a faster MVP; core implementation tasks are never optional.
- Each task references the specific requirement sub-clauses or design properties it implements for traceability.
- Property-based tests (pytest + Hypothesis, ≥100 iterations) sit next to the pure backend logic they verify (V1/V3/V4-duplicate/V5, pipeline, join codes, answers, broadcast, analytics, persistence). Anthropic-dependent validators (V2, V4-entailment, V6), WebSocket flows, and UI use mocked example/integration tests.
- Backend foundations (scaffolding, data layer, pure validators) are ordered before Anthropic integration and the live session layer; the frontend is built against the finalized backend contracts.
- Property generators should cover boundary edges: 99/100 and 10000/10001 chars, FK 5.0 and 6.9, exactly 40 participants, and empty skill buckets.

## Task Dependency Graph

```json
{
  "waves": [
    { "id": 0, "tasks": ["2.1", "3.1", "5.1", "9.1", "13.1", "13.2"] },
    { "id": 1, "tasks": ["2.2", "4.1", "4.3", "4.5", "4.7", "5.2", "9.2", "9.3", "14.1"] },
    { "id": 2, "tasks": ["2.3", "2.4", "4.2", "4.4", "4.6", "4.8", "5.3", "5.4", "6.1", "9.4", "9.5", "9.6", "14.2", "14.3", "15.1", "16.1", "16.2", "18.1"] },
    { "id": 3, "tasks": ["6.2", "8.1", "9.7", "9.8", "9.9", "10.1", "14.4", "15.2", "16.3", "18.2", "18.3", "18.4"] },
    { "id": 4, "tasks": ["8.2", "9.10", "10.2", "11.1", "11.2", "15.3", "16.4", "17.1", "18.5", "18.6"] },
    { "id": 5, "tasks": ["8.3", "8.4", "11.3", "17.2"] }
  ]
}
```
