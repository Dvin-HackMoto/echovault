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
- [ ] AST-1 Intent detection
- [ ] AST-2 Retrieval
- [ ] AST-3 Answer building
- [ ] AST-4 Ask endpoint and logging
- [ ] AST-5 Voice endpoint
- [ ] AST-6 Flag a wrong answer

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

## AST-1

MODULE FROM: Assistant
Task: Intent detection
Owner: N/A
Goal: Fill in `features/assistant/intent.py` with keyword rules returning `who_is`, `next_event`, `medication` or `general`.
Priority: P0
Dependencies: None
Acceptance Criteria:
- [ ] "sino si …" and "who is …" return `who_is` with the name extracted
- [ ] "ano susunod", "next" and "today" return `next_event`
- [ ] "gamot" and "medicine" return `medication`
- [ ] Anything else returns `general`
Status: TODO

## AST-2

MODULE FROM: Assistant
Task: Retrieval
Owner: N/A
Goal: Fill in `features/assistant/retrieve.py` with one retrieval path per intent, using the core retrieval query from ARCHITECTURE.md for `general`.
Priority: P0
Dependencies: AST-1, MEM-1, PPL-1, SCH-2, MED-1
Acceptance Criteria:
- [ ] `who_is` matches people by name or nickname and returns their verified, valid memories
- [ ] `next_event` returns today's or the next schedule occurrence
- [ ] `medication` returns medications, their times and today's logs
- [ ] `general` never returns unverified, conflicting, outdated, archived or out-of-validity memories
Status: TODO

## AST-3

MODULE FROM: Assistant
Task: Answer building
Owner: N/A
Goal: Fill in `features/assistant/answer.py`: fixed templates for `medication` and `next_event`, LLM phrasing for `who_is` and `general`, the `no_data` reply, and the fallback on LLM failure.
Priority: P0
Dependencies: AST-2, AI-2
Acceptance Criteria:
- [ ] Medication and schedule answers come from templates with no LLM call
- [ ] With no verified records, the reply is the `no_data` message naming the `is_caregiver` person
- [ ] An LLM timeout produces a fallback answer and `answer_mode = fallback`
- [ ] The returned `answer_mode` is one of `template`, `llm`, `fallback`, `no_data`
Status: TODO

## AST-4

MODULE FROM: Assistant
Task: Ask endpoint and logging
Owner: N/A
Goal: Fill in `features/assistant/router.py` with `POST /assistant/ask {text}` running intent, retrieve and answer, then writing to `assistant_log`.
Priority: P0
Dependencies: AST-3
Acceptance Criteria:
- [ ] The response is `{answer, people[] with photo URLs, memory_ids}`
- [ ] Each call writes question, intent, answer, `answer_mode` and `memory_ids` to `assistant_log`
- [ ] An empty question returns a clear 4xx error
- [ ] The endpoint works in patient mode with no PIN
Status: TODO

## AST-5

MODULE FROM: Assistant
Task: Voice endpoint
Owner: N/A
Goal: Add `POST /assistant/voice` that accepts an audio file, transcribes it with `stt.py`, and runs the same pipeline as `/assistant/ask`.
Priority: P1
Dependencies: AST-4, AI-4
Acceptance Criteria:
- [ ] A recorded question returns the same response shape as the text endpoint, plus the transcript
- [ ] The log row has `input_mode = voice`
- [ ] An unintelligible recording returns "Sorry, I didn't catch that" instead of a guessed answer
- [ ] The uploaded audio file is deleted after transcription
Status: TODO

## AST-6

MODULE FROM: Assistant
Task: Flag a wrong answer
Owner: N/A
Goal: Add a caregiver endpoint (assumed `POST /assistant/log/{id}/flag`) to mark an `assistant_log` row as a bad answer, and a list of recent answers.
Priority: P2
Dependencies: AST-4
Acceptance Criteria:
- [ ] A caregiver can list recent questions and answers with the records used
- [ ] Flagging sets `flagged = 1` and unflagging clears it
- [ ] Patient mode cannot read or flag the log
Status: TODO
