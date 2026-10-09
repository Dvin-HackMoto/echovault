# MODULE: Assistant

Owner: TBD

Goal:
Answer the patient's questions from verified local records, by text or voice, and admit when the information is missing.

Features:
- Rule-based intent detection (English and Filipino)
- Structured and full-text retrieval
- Template and LLM answers
- Voice input
- Answer log with traceability

Tasks:
- [x] AST-1 Intent detection
- [x] AST-2 Retrieval
- [x] AST-3 Answer building
- [x] AST-4 Ask endpoint and logging
- [x] AST-5 Voice endpoint
- [x] AST-6 Flag a wrong answer

Dependencies:
- Memories
- People and Places
- Schedule
- Medications
- AI Services

Definition of Done:
- "Who is Ana?", "What is my next appointment?" and "What medicine do I take?" return correct answers from seeded data
- A question with no verified record returns the `no_data` reply naming the caregiver
- Every answer is logged with the records it used

## What exists

| File | What it does |
|---|---|
| `backend/app/features/assistant/intent.py` | `detect(text)`: keyword rules in English and Filipino |
| `backend/app/features/assistant/retrieve.py` | One retrieval path per intent, and the memory queries (FTS and by person) |
| `backend/app/features/assistant/answer.py` | Templates (English and Filipino), LLM phrasing, fallback, the no-data reply |
| `backend/app/features/assistant/repository.py` | `assistant_log` SQL, and resolving logged ids back to their records |
| `backend/app/features/assistant/router.py` | The four endpoints below |
| `backend/tests/test_assistant.py` | Runs the real app and schema with the demo seed in it. Only Ollama's HTTP endpoint and the Whisper model are replaced |
| `mobile/src/api/assistant.ts` | `ask`, `askVoice`, and for the caregiver app `listAnswers`, `flagAnswer` |
| `mobile/tests/hubContract.test.ts` | "answers have what the Ask screen reads", against a running hub (`HUB_URL=... npm run test:patient`) |

The router is found by `main.py` on startup. People, schedule and medications are read through their own services (`people.service.find_by_name` / `fallback_caregiver` / `verified_people`, `schedule.service.next_occurrence` / `today`, `medications.service.today_doses` / `next_doses`). Memories (module 04) has no service yet, so the two memory queries live in `retrieve.py`; they can move behind a memories service when MEM-1 lands.

## Endpoints

| Call | Who | Returns |
|---|---|---|
| `POST /assistant/ask {text}` | patient, caregiver | `{answer, answer_mode, intent, people[], memory_ids[]}`. 422 when `text` is missing or blank |
| `POST /assistant/voice` (multipart field `audio`) | patient, caregiver | the same, plus `transcript`. No words heard: 200 with "Sorry, I didn't catch that", `transcript: ""`, nothing logged. Whisper cannot load: 503 |
| `GET /assistant/log?limit=50&flagged=true` | caregiver | `assistant_log` rows, newest first, each with `records: [{id, type, label, detail, trust}]` |
| `POST /assistant/log/{id}/flag` | caregiver (not a viewer) | the row. Body `{"flagged": false}` clears the flag |

## Decisions

- **Rule order:** medication, then next_event, then who_is, then general. "What is my next medicine?" is `medication`; "Who is visiting today?" is `next_event`.
- **Language:** `patient.language` decides the wording. `fil` gives Filipino templates, `en` and `fil-en` English, the same rule as `ai/fallback.py`.
- **Medication answer:** today's doses with their times, then the next dose nobody has answered yet. A confirmed dose reads "(marked as taken)" or "(marked as skipped)", never "you took it" (PRODUCT.md: a confirmation does not prove the medicine was taken).
- **Schedule answer:** "next / susunod" gives the one next occurrence; "today / ngayon" lists what is still left today, or the next occurrence when nothing is left. "appointment / check-up" prefers items of kind `appointment` and falls back to the next item of any kind.
- **who_is with no verified person of that name:** the name is searched in verified memories ("Ernesto" is only in a memory). An unverified person is never used. Nothing found gives the no-data reply.
- **no_data:** also used when the model itself answers with the no-data reply; `memory_ids` is then empty.
- **`memory_ids`:** every record id the answer used, not only memories: the person for `who_is`, schedule items for `next_event`, medications for `medication`. `GET /assistant/log` resolves them; a record deleted since then shows as `type: "deleted"`.
- **`people[]`:** the matched people for `who_is`; the person linked to a schedule item; for `general`, only linked people the answer mentions by name; for no-data, the caregiver the reply names. Always verified people, with `photo_url`.
- **Fallback (Ollama down or slower than `LLM_TIMEOUT_S`):** at most 3 records. For `who_is` the person and their identity memories; for a search, only the memories sharing the most words with the question.

## Not verified here

- The `llm` answer mode against a real model: Ollama was not installed on the machine this was built on. The tests replace Ollama's HTTP endpoint, and a live run without Ollama exercised the fallback path. `pytest -m integration` (AI Services) covers the real model on the hub laptop.
- The Ask screen on a physical phone against the real hub.

## AST-1

MODULE FROM: Assistant
Task: Intent detection
Owner: N/A
Goal: Fill in `features/assistant/intent.py` with keyword rules returning `who_is`, `next_event`, `medication` or `general`.
Priority: P0
Dependencies: None
Acceptance Criteria:
- [x] "sino si …" and "who is …" return `who_is` with the name extracted
- [x] "ano susunod", "next" and "today" return `next_event`
- [x] "gamot" and "medicine" return `medication`
- [x] Anything else returns `general`
Status: REVIEW

## AST-2

MODULE FROM: Assistant
Task: Retrieval
Owner: N/A
Goal: Fill in `features/assistant/retrieve.py` with one retrieval path per intent, using the core retrieval query from ARCHITECTURE.md for `general`.
Priority: P0
Dependencies: AST-1, MEM-1, PPL-1, SCH-2, MED-1
Acceptance Criteria:
- [x] `who_is` matches people by name or nickname and returns their verified, valid memories
- [x] `next_event` returns today's or the next schedule occurrence
- [x] `medication` returns medications, their times and today's logs
- [x] `general` never returns unverified, conflicting, outdated, archived or out-of-validity memories
Status: REVIEW

## AST-3

MODULE FROM: Assistant
Task: Answer building
Owner: N/A
Goal: Fill in `features/assistant/answer.py`: fixed templates for `medication` and `next_event`, LLM phrasing for `who_is` and `general`, the `no_data` reply, and the fallback on LLM failure.
Priority: P0
Dependencies: AST-2, AI-2
Acceptance Criteria:
- [x] Medication and schedule answers come from templates with no LLM call
- [x] With no verified records, the reply is the `no_data` message naming the `is_caregiver` person
- [x] An LLM timeout produces a fallback answer and `answer_mode = fallback`
- [x] The returned `answer_mode` is one of `template`, `llm`, `fallback`, `no_data`
Status: REVIEW

## AST-4

MODULE FROM: Assistant
Task: Ask endpoint and logging
Owner: N/A
Goal: Fill in `features/assistant/router.py` with `POST /assistant/ask {text}` running intent, retrieve and answer, then writing to `assistant_log`.
Priority: P0
Dependencies: AST-3
Acceptance Criteria:
- [x] The response is `{answer, people[] with photo URLs, memory_ids}`
- [x] Each call writes question, intent, answer, `answer_mode` and `memory_ids` to `assistant_log`
- [x] An empty question returns a clear 4xx error
- [x] The endpoint works in patient mode with no PIN
Status: REVIEW

## AST-5

MODULE FROM: Assistant
Task: Voice endpoint
Owner: N/A
Goal: Add `POST /assistant/voice` that accepts an audio file, transcribes it with `stt.py`, and runs the same pipeline as `/assistant/ask`.
Priority: P1
Dependencies: AST-4, AI-4
Acceptance Criteria:
- [x] A recorded question returns the same response shape as the text endpoint, plus the transcript
- [x] The log row has `input_mode = voice`
- [x] An unintelligible recording returns "Sorry, I didn't catch that" instead of a guessed answer
- [x] The uploaded audio file is deleted after transcription
Status: REVIEW

## AST-6

MODULE FROM: Assistant
Task: Flag a wrong answer
Owner: N/A
Goal: Add a caregiver endpoint (`POST /assistant/log/{id}/flag`) to mark an `assistant_log` row as a bad answer, and a list of recent answers (`GET /assistant/log`).
Priority: P2
Dependencies: AST-4
Acceptance Criteria:
- [x] A caregiver can list recent questions and answers with the records used
- [x] Flagging sets `flagged = 1` and unflagging clears it
- [x] Patient mode cannot read or flag the log
Status: REVIEW
