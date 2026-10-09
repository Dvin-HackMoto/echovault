# MODULE: Trivia and Memory Prompts

Owner: TBD

Goal:
Show occasional, optional prompts at caregiver-set intervals without interrupting sleep, appointments or quiet periods.

Features:
- Preloaded general trivia
- Personal prompts linked to verified memories
- Quiet-hour and appointment suppression
- Caregiver-written questions

Tasks:
- [x] TRV-1 Preloaded trivia
- [x] TRV-2 Next prompt endpoint
- [x] TRV-3 Caregiver-written questions
- [x] TRV-4 Outcome recording
- [x] TRV-5 Mock data and isolated tests
- [x] TRV-6 Mobile data layer

Dependencies:
- Memories (only the `memories` table; the Memories router is not needed)
- Schedule (`service.occurrences_between`)
- Settings and Dashboard (the `settings` table)

Definition of Done:
- `GET /trivia/next` returns a prompt when allowed and nothing when it is not
- General trivia works with no internet
- Personal prompts always link to a verified memory

## What exists

| File | What it does |
|---|---|
| `backend/assets/trivia.json` | 36 general questions: id, topic, difficulty, question, answer, three choices |
| `backend/app/features/trivia/loader.py` | Loads that file into `trivia_questions`. `main.py` runs it on every startup |
| `backend/app/features/trivia/router.py` | The endpoints below |
| `backend/app/features/trivia/service.py` | Suppression rules, picking a question, recording outcomes, validation |
| `backend/app/features/trivia/repository.py` | `trivia_questions` SQL and the `trivia_prompt` rows of `activity_log` |
| `backend/app/features/trivia/deps.py` | **The only place Trivia imports from other modules** |
| `backend/tests/trivia_data.py` | Mock household for the tests: memories in every trust and validity state, a day's schedule, settings, questions |
| `backend/tests/test_trivia.py` | Every rule, on the mock household with a fixed clock |
| `mobile/src/api/trivia.ts` | Typed calls for every endpoint |
| `mobile/src/testing/recorded/trivia.json` | Real responses; `contract.test.ts` checks the mobile types against them |

## Endpoints

Every request needs `X-Role`. The question endpoints need `X-Role: caregiver` and a valid `X-Caregiver-Id`.

| Method | Path | Who | Notes |
|---|---|---|---|
| GET | `/trivia/next` | both | A question with `people`, or `null` when this is not a good moment |
| POST | `/trivia/result` | both | 201. `{question_id, outcome: completed\|skipped, duration_sec?}` |
| GET | `/trivia/questions` | caregiver | `?source=`, `?kind=`, `?active_only=true` |
| GET | `/trivia/questions/{id}` | caregiver | |
| POST | `/trivia/questions` | caregiver | 201. Saved with `source = caregiver` |
| PUT | `/trivia/questions/{id}` | caregiver | Partial update. `{"is_active": false}` switches a question off |
| DELETE | `/trivia/questions/{id}` | caregiver (admin) | 204. Refused for preloaded questions |

**Question fields:** `kind`\* (`general|personal|family|routine`), `question`\*, `answer`\*, `choices` (a list; stored and returned as a JSON array string, `null` for open recall), `topic`, `memory_id`, `difficulty` (1 to 3, default 1), `is_active` (default 1).

**A prompt** is the question row plus `people`: the verified person its memory is about, with `photo_url`, or an empty list.

**Validation errors** return 422 with a readable `detail`.

## Rules worth knowing

- **When the hub stays quiet.** `GET /trivia/next` returns `null`:
  - inside the caregiver's `quiet_hours` (it may run past midnight);
  - from 30 minutes before any active schedule item starts until 30 minutes after it ends, which covers every `is_quiet_period` item while it runs;
  - for `trivia_frequency_min` after the last `POST /trivia/result`.
- **Which question.** Active questions up to `game_difficulty`. General and personal questions take turns, and the one shown longest ago goes first, so nothing repeats while there is something else to ask.
- **General trivia is always eligible.** `game_topics` filters only the personal questions, because every allowed topic is a personal one.
- **Verified memories only.** A `personal`, `family` or `routine` question needs a `memory_id`, and is shown only while that memory is verified, not archived and inside its validity dates. This is checked when a caregiver saves the question and again every time one is picked. Deleting the memory deletes its questions.
- **Engagement only.** An outcome is `completed` or `skipped`. `correct` and `incorrect` are rejected, so right-or-wrong is never stored and can never be shown as a score.
- **A prompt nobody answered** does not start the frequency wait; only a reported outcome does.
- **Preloaded questions** can be switched off or on, not edited or deleted, and a restart keeps the caregiver's choice. Changing `trivia.json` updates them on the next startup; removing one from the file removes it.
- **Clock.** All times are the hub's Manila time.

## For other modules

```python
from app.features.trivia import service as trivia

trivia.next_prompt(conn)          # the prompt to show now, or None
trivia.suppression_reason(conn)   # 'quiet_hours' | 'schedule' | 'frequency' | None
```

GAM-3 can read preloaded and caregiver questions straight from `trivia_questions`; they are there from the first startup.

## TRV-1

MODULE FROM: Trivia and Memory Prompts
Task: Preloaded trivia
Owner: N/A
Goal: Write the general questions in `assets/trivia.json` and load them into `trivia_questions` with `source = preloaded`.
Priority: P1
Dependencies: HUB-2
Acceptance Criteria:
- [x] At least 30 simple questions about everyday life, with answers, topics and difficulty
- [x] Loading twice does not duplicate questions
- [x] Questions are suitable for the audience: familiar, short, never trick questions
Status: REVIEW

## TRV-2

MODULE FROM: Trivia and Memory Prompts
Task: Next prompt endpoint
Owner: N/A
Goal: Fill in `features/trivia/service.py` and `router.py` with `GET /trivia/next` and its suppression rules.
Priority: P1
Dependencies: TRV-1, SCH-2, SET-1
Acceptance Criteria:
- [x] Returns nothing inside `quiet_hours`
- [x] Returns nothing within 30 minutes of a schedule item, or during one with `is_quiet_period = 1`
- [x] Returns nothing if the last prompt was answered or skipped less than `trivia_frequency_min` ago
- [x] Otherwise returns an active question matching `game_topics`; personal ones only if their memory is verified
Status: REVIEW

## TRV-3

MODULE FROM: Trivia and Memory Prompts
Task: Caregiver-written questions
Owner: N/A
Goal: Add caregiver CRUD for `trivia_questions` with `source = caregiver`.
Priority: P2
Dependencies: TRV-2, MEM-2
Acceptance Criteria:
- [x] A personal question cannot be saved without a `memory_id` pointing to a verified memory
- [x] Deleting the memory removes its questions
- [x] A caregiver can deactivate a question without deleting it
Status: REVIEW

## TRV-4

MODULE FROM: Trivia and Memory Prompts
Task: Outcome recording
Owner: N/A
Goal: Add `POST /trivia/result` so a prompt's outcome reaches `activity_log` and the frequency rule has something to read.
Priority: P1
Dependencies: TRV-2
Acceptance Criteria:
- [x] `completed` and `skipped` are saved as `trivia_prompt` with the question's id, topic and difficulty
- [x] `correct`, `incorrect` and unknown questions are rejected and nothing is saved
- [x] The next prompt waits `trivia_frequency_min` from the saved outcome
Status: REVIEW

## TRV-5

MODULE FROM: Trivia and Memory Prompts
Task: Mock data and isolated tests
Owner: N/A
Goal: Test every trivia rule without the demo seed or the Memories router.
Priority: P1
Dependencies: TRV-2, TRV-3, TRV-4
Acceptance Criteria:
- [x] `tests/trivia_data.py` builds memories in every trust and validity state, a day's schedule, settings and questions
- [x] Each suppression rule is tested at its boundaries with a fixed clock
- [x] Trivia imports other modules only through `deps.py`
Status: REVIEW

## TRV-6

MODULE FROM: Trivia and Memory Prompts
Task: Mobile data layer
Owner: N/A
Goal: Make the phone's trivia calls and types match the real hub.
Priority: P1
Dependencies: TRV-2, TRV-4, MOB-2
Acceptance Criteria:
- [x] `src/api/trivia.ts` covers every endpoint
- [x] The patient card (PAT-8) reports outcomes to `POST /trivia/result` as `completed` or `skipped`
- [x] The demo hub has the same `POST /trivia/result` rules as the real hub
- [x] `contract.test.ts` checks `TriviaPrompt` against a response recorded from the real router
Status: REVIEW
