# Requirements Document

## Introduction

The Reading Comprehension Screener backend is a Python FastAPI service that lets teachers schedule typed reading assessments, lets learners answer in text, runs each submitted assessment through a single AI check, and computes scores and diagnoses in backend code (never the AI). Teachers can override any AI verdict, which immediately recomputes the score and diagnosis. The service exposes a JSON HTTP API consumed by a React (Vercel) frontend and persists to a Supabase Postgres database over `psycopg` v3.

These requirements are derived from the authoritative design document (`design.md`) in a design-first workflow. They capture the MVP source of truth already encoded in the design: a strictly layered architecture (router → service → repository), minimal `X-User-Id` identity, `Asia/Manila` "today" comparisons, and a scaffolding goal in which the Supabase connection is wired for real and the AI client (`chatbot_client.py`) ships as a working stub so the system runs end-to-end before the AI provider is announced.

Requirement numbering is aligned with the correctness-property traceability already embedded in the design (e.g., Requirement 5.2 = access-code uniqueness, 5.3 = single-attempt submit, 5.5 = override invariants, 6.1–6.5 = evaluation rules, 7.1 = dashboard exclusion of inactive learners).

## Glossary

- **System**: The Reading Comprehension Screener FastAPI backend service as a whole.
- **Auth_Service**: The component resolving login and the current user from identity.
- **Classroom_Service**: The component managing classrooms, roster, and student edits.
- **Scheduling_Service**: The component that creates assessment batches.
- **Taking_Service**: The component that starts and submits learner assessments.
- **Learner_View_Service**: The component serving learner-facing assessment reads.
- **Review_Service**: The component applying teacher overrides and recomputing results.
- **Evaluation_Service**: The component orchestrating the AI call, scoring, and diagnosis.
- **Scoring_Module**: The pure functions computing `comprehension_score` and `diagnosis`.
- **Dashboard_Service**: The component serving read-only aggregate queries.
- **AI_Client**: The swappable `AIClient` abstraction (`chatbot_client.py` stub in MVP).
- **Current_User**: The user resolved from the `X-User-Id` request header.
- **Teacher**: A user with `role = 'teacher'`.
- **Learner**: A user with `role = 'learner'` and a Learner Reference Number.
- **LRN**: Learner Reference Number; the unique login identifier for a learner.
- **Batch**: All assessments sharing one `access_code`; one assessment row per learner at scheduling time.
- **Access_Code**: A 6-character uppercase alphanumeric code identifying a batch.
- **Final_Verdict**: `COALESCE(teacher_override, ai_verdict)` for an answer.
- **Blank_Answer**: An answer whose `answer_text` is null, empty, or only whitespace.
- **PII**: Learner names, LRNs, and classroom names.
- **Manila_Date**: The current date computed in the `Asia/Manila` timezone.
- **Inactive_Learner**: A learner whose `is_active` flag is `false`.

## Requirements

### Requirement 1: Roles and Authentication

**User Story:** As a teacher or learner, I want to identify myself with a lightweight login, so that the system can associate my actions with my account without heavyweight authentication in this MVP.

#### Acceptance Criteria

1. WHEN a login request includes a non-empty teacher name, THE Auth_Service SHALL match the name case-insensitively against users with `role = 'teacher'` and return the matching teacher's `id`, `name`, `role`, and `classroom_id`.
2. WHEN a login request includes a non-empty LRN, THE Auth_Service SHALL match it against `learner_reference_number` for an active learner and return the matching learner's `id`, `name`, `role`, and `classroom_id`.
3. IF a login request includes neither a teacher name nor an LRN, or both are empty, THEN THE Auth_Service SHALL reject the login with a `400` response indicating missing credentials.
4. IF a login request matches no user, THEN THE Auth_Service SHALL reject the login with a `401` response.
5. IF a learner login request matches an Inactive_Learner, THEN THE Auth_Service SHALL reject the login with a `401` response.
6. WHEN any request carries the `X-User-Id` header matching an existing user, THE System SHALL resolve that user as the Current_User for the request.
7. IF a request omits the `X-User-Id` header or carries an unknown user id, THEN THE System SHALL reject the request with a `401` response.
8. IF the Current_User on a teacher-only route is not a Teacher, THEN THE System SHALL reject the request with a `403` response.

### Requirement 2: Classrooms and Roster

**User Story:** As a teacher, I want to create classrooms and manage my roster including late joiners, so that every current learner can be scheduled for assessments and no learner history is lost.

#### Acceptance Criteria

1. WHEN a Teacher creates a classroom with a `name` of 1 to 100 characters, THE Classroom_Service SHALL persist the classroom with its `name` and the creating Teacher's `teacher_id`.
2. IF a Teacher creates a classroom with an empty or over-length `name`, THEN THE Classroom_Service SHALL reject the request with a `422` or `400` response indicating the invalid name.
3. WHEN a Teacher submits a bulk roster where each line is either `LRN` or `LRN, Name`, THE Classroom_Service SHALL create one learner record per valid new entry with `role = 'learner'`, the parsed LRN, the `classroom_id`, and `is_active = true`.
4. WHEN a bulk roster entry omits a name, THE Classroom_Service SHALL default the learner `name` to `Learner <last 4 of LRN>`.
5. WHEN a bulk roster entry references an LRN that already exists, THE Classroom_Service SHALL skip creating a duplicate and SHALL report that LRN as skipped.
6. IF a bulk roster entry is malformed or its LRN is not 12 digits, THEN THE Classroom_Service SHALL skip that entry and report it as invalid without aborting the rest of the batch.
7. WHEN a Teacher updates a learner's `name`, `learner_reference_number`, `classroom_id`, or `is_active`, THE System SHALL persist the change and set the learner's `updated_at` to the current time.
8. WHEN a Teacher deactivates a learner, THE Classroom_Service SHALL set `is_active = false` and SHALL retain the learner record and its assessment history rather than deleting it.
9. WHEN a learner is added to a classroom, THE Classroom_Service SHALL create assessment rows and corresponding answer rows for every existing Batch in that classroom whose `scheduled_for` is greater than or equal to the Manila_Date.

### Requirement 3: Taking an Assessment

**User Story:** As a learner, I want to open and submit my assessment with typed answers, so that my responses are recorded and evaluated.

#### Acceptance Criteria

1. WHEN a learner starts an assessment whose `scheduled_for` date is on or before the Manila_Date and whose `status` is `scheduled`, THE Taking_Service SHALL set the assessment `status` to `in_progress`.
2. IF a learner attempts to start an assessment whose `scheduled_for` date is after the Manila_Date, or whose `status` is already `in_progress` or `completed`, THEN THE Taking_Service SHALL reject the request, leave the existing `status` unchanged, and return an error response indicating the assessment cannot be started.
3. WHEN a learner submits an assessment whose `status` is `scheduled` or `in_progress`, THE Taking_Service SHALL save the submitted answer text for each provided answer, set `status` to `completed`, and set `completed_at` to the current time.
4. IF a submit request targets an assessment whose `status` is already `completed`, THEN THE Taking_Service SHALL reject the submission with a `400` response that indicates the assessment is already completed and SHALL NOT mutate the saved answers or `completed_at`.
5. WHEN an assessment is set to `completed` on submit, THE Taking_Service SHALL enqueue a single background evaluation task for that assessment.
6. WHEN an assessment submission is accepted and the evaluation task is enqueued, THE Taking_Service SHALL return a `202` response so the learner view can poll for results.

### Requirement 4: Learner View

**User Story:** As a learner, I want to view my own assessment with its verdicts and feedback, so that I can see how I did and acknowledge teacher corrections.

#### Acceptance Criteria

1. WHEN a learner requests an assessment by Access_Code, THE Learner_View_Service SHALL return only the single assessment row whose owning learner matches the requesting learner's identity.
2. IF a learner requests an assessment by Access_Code and no row with that Access_Code belongs to the requesting learner, THEN THE Learner_View_Service SHALL respond with `404`.
3. WHEN a learner views an assessment whose `diagnosis` is non-null and `evaluation_error` is null, THE Learner_View_Service SHALL present each answer's Final_Verdict, `evidence`, `comprehension_score`, `diagnosis`, `evaluation`, and `recommendation`.
4. WHILE an assessment has `diagnosis` IS NULL and `evaluation_error` IS NULL, THE Learner_View_Service SHALL report the assessment's evaluation state as in-progress rather than returning verdict fields.
5. IF an assessment has a non-null `evaluation_error`, THEN THE Learner_View_Service SHALL report the assessment's evaluation state as failed.
6. WHEN a learner acknowledges corrections on an assessment, THE Learner_View_Service SHALL set `corrections_seen_at` to the current time and return a success response.
7. WHILE an assessment has at least one answer whose `overridden_at` is later than `corrections_seen_at`, or has `corrections_seen_at` IS NULL together with at least one existing override, THE Learner_View_Service SHALL report a correction alert for that assessment.

### Requirement 5: Scheduling and Core Workflow Integrity

**User Story:** As a teacher, I want to schedule a batch of assessments with a unique join code and have single-attempt submission and override integrity enforced, so that assessment data stays trustworthy and uncorrupted.

#### Acceptance Criteria

1. WHEN a Teacher schedules a batch, THE Scheduling_Service SHALL require between 3 and 5 questions inclusive, each with a non-empty `question_text`, a `skill` whose value is exactly one of `literal`, `inference`, `vocabulary`, or `sequencing`, and a non-empty `expected_ideas`, and SHALL reject any non-conforming form with a `422` or `400` response that indicates which field failed validation without persisting any assessment or answer rows.
2. WHEN a Teacher schedules a batch, THE Scheduling_Service SHALL assign an Access_Code that matches the pattern `^[A-Z0-9]{6}$` and is unique across all existing assessments, so that an Access_Code resolves to at most one assessment per learner.
3. IF a submit request targets an assessment whose `status` is already `completed`, THEN THE Taking_Service SHALL reject the submission with a `400` response that indicates the assessment is already completed and SHALL NOT mutate the saved answers or `completed_at`.
4. WHEN a Teacher schedules a batch for a classroom, THE Scheduling_Service SHALL create exactly one assessment row with `status = 'scheduled'` for each active learner in that classroom and exactly one answer row per question per created assessment.
5. WHEN a Teacher sets or clears an override on an answer, THE Review_Service SHALL compute the Final_Verdict as `COALESCE(teacher_override, ai_verdict)`, recompute `comprehension_score` and `diagnosis` from the Final_Verdicts, and SHALL preserve the existing `evaluation` and `recommendation` values unchanged.
6. IF a Teacher schedules a batch for a classroom that has zero active learners, THEN THE Scheduling_Service SHALL create no assessment rows and SHALL reject the request with a `400` response that indicates there are no active learners to schedule.
7. WHEN a Teacher sets an override with a non-null `verdict` that is exactly one of `correct`, `partial`, or `missed`, THE Review_Service SHALL set `overridden_at` to the current timestamp and store the provided `override_note`; WHEN a Teacher clears an override by sending a null `verdict`, THE Review_Service SHALL clear `overridden_at` and `override_note`; and IF the `verdict` is any value other than `correct`, `partial`, `missed`, or null, THEN THE Review_Service SHALL reject the request with a `422` or `400` response that indicates an invalid verdict and SHALL NOT modify the answer's override fields.

### Requirement 6: Evaluation, Scoring, and Diagnosis

**User Story:** As a teacher, I want each submitted assessment checked by the AI and scored by backend code with learner privacy protected, so that results are consistent, explainable, and never computed by the AI.

#### Acceptance Criteria

1. WHEN the Scoring_Module computes a score, THE Scoring_Module SHALL assign 1.0 point for a `correct` Final_Verdict, 0.5 for `partial`, and 0.0 for `missed`, treat each Blank_Answer as `missed`, and compute `comprehension_score = round(100 * total_points / num_questions, 1)` within the range 0.0 to 100.0.
2. WHEN the Evaluation_Service builds an AI prompt, THE Evaluation_Service SHALL exclude every learner name, LRN, and classroom name from the prompt payload, so that no such PII value is sent to the AI_Client.
3. WHEN the Evaluation_Service stores evidence for a non-blank answer, THE Evaluation_Service SHALL store the evidence only when it is a verbatim substring of the passage and SHALL store `null` when the quote is not a verbatim substring of the passage, and WHEN the answer is a Blank_Answer THE Evaluation_Service SHALL store `null` evidence.
4. WHEN the Scoring_Module computes a diagnosis, THE Scoring_Module SHALL return `highest_priority` when `comprehension_score < 40` or an unoverridden Blank_Answer exists, `comprehension_barrier` when `40 <= comprehension_score < 70`, and `on_track` when `comprehension_score >= 70`.
5. IF the AI response is invalid after one retry — where invalid means the response is not valid JSON, does not contain exactly one entry per non-blank answer, contains a verdict outside the allowed set, or no response is received within the 15-second timeout — THEN THE Evaluation_Service SHALL set `evaluation_error`, leave `diagnosis` null, write no partial AI verdicts to any answer, and SHALL allow a Teacher to clear the error and re-run evaluation via the teacher retry endpoint.
6. WHERE every answer in an assessment is a Blank_Answer, THE Evaluation_Service SHALL set each answer's `ai_verdict` to `missed` in code, skip the AI call entirely, and compute the score and diagnosis.
7. WHEN the Evaluation_Service completes an AI call, THE Evaluation_Service SHALL log the tokens used and the call latency to the console.

### Requirement 7: Dashboards

**User Story:** As a teacher, I want read-only dashboards that reflect active learners while preserving historical records, so that I can target help without losing past data.

#### Acceptance Criteria

1. WHEN a Teacher requests any dashboard aggregate, THE Dashboard_Service SHALL exclude Inactive_Learners from the results while preserving their existing assessment history rows in the database.
2. WHEN the Dashboard_Service aggregates verdicts, THE Dashboard_Service SHALL compute aggregates using the Final_Verdict of each answer, scoring a correct answer as 1.0 and a partial answer as 0.5.
3. WHEN the Dashboard_Service groups most-missed questions, THE Dashboard_Service SHALL group by `access_code` combined with `question_text` and sort the groups in ascending order of percent correct.
4. WHEN a Teacher requests a dashboard aggregate without specifying an `access_code`, THE Dashboard_Service SHALL resolve the target batch as the most recent batch in the classroom that has at least one completed assessment.
5. IF a Teacher requests a dashboard aggregate with an `access_code` that does not exist in the classroom or has no completed assessment, THEN THE Dashboard_Service SHALL return an error response indicating that no matching batch with a completed assessment was found, without modifying any stored data.
6. THE Dashboard_Service SHALL serve all dashboard endpoints as read-only operations that make no modification to stored learner, assessment, or verdict data.

### Requirement 8: Infrastructure and Configuration

**User Story:** As a developer, I want the backend scaffolded end-to-end with a real Supabase connection and a working AI stub, so that the modular system runs before the AI provider is announced and swapping in the real provider touches only one file.

#### Acceptance Criteria

1. THE System SHALL load configuration at startup from environment variables including `DATABASE_URL`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`, `CORS_ORIGINS`, and `TIMEZONE` (default `Asia/Manila`).
2. IF a required environment variable (`DATABASE_URL`, `CORS_ORIGINS`) is absent or empty at startup, THEN THE System SHALL abort startup and emit a startup error message indicating which variable is missing.
3. THE System SHALL establish a `psycopg` connection pool against the Supabase pooler connection string from `DATABASE_URL`, wired for real from environment configuration.
4. THE AI_Client SHALL ship as a working stub (`chatbot_client.py`) that implements the `AIClient.complete(prompt: str) -> str` interface and returns a deterministic placeholder response matching the response contract shape, such that identical input produces identical output across invocations.
5. WHEN the AI provider is announced, THE System SHALL require changes only within `chatbot_client.py` and the accompanying cost-per-learner note, with no other module modified.
6. WHEN a request is made to the `/health` endpoint without authentication credentials, THE System SHALL respond with a success response indicating the service is reachable.
7. WHEN handling a cross-origin request whose origin matches an entry in `CORS_ORIGINS`, THE System SHALL permit the request and SHALL allow the `X-User-Id` request header.
8. WHEN comparing dates to determine "today", THE System SHALL use the `Asia/Manila` timezone.
9. THE System SHALL enable row level security with no policies on the `users`, `classrooms`, `assessments`, and `answers` tables, so that the backend's direct Postgres role bypasses RLS and the frontend never connects to Postgres directly.
