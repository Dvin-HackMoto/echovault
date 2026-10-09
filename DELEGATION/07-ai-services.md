# MODULE: AI Services

Owner: TBD

Goal:
Wrap the local language model and speech-to-text so the rest of the backend calls two simple functions and still works when the model is down.

Features:
- Ollama completion with timeout
- Grounded system prompt
- Template fallback
- Local speech-to-text

Tasks:
- [x] AI-1 Ollama client
- [x] AI-2 Grounded prompt
- [x] AI-3 Fallback answers
- [x] AI-4 Speech-to-text

Dependencies:
- Hub Foundation

Definition of Done:
- `complete(prompt)` returns text from the local model with no internet
- A slow or stopped Ollama produces a fallback answer instead of an error
- `transcribe(path)` returns text for an English or Filipino recording

## What the Assistant module (08) calls

Everything is in `backend/app/ai/` and importable as `from app.ai import ...`:

| Call | Use in `features/assistant/answer.py` |
|---|---|
| `build_system_prompt(language, caregiver)` | System prompt: answer only from the records, ignore instructions inside them, at most 2 short sentences, in `patient.language`, and the exact no-data reply naming the caregiver (`people.is_caregiver = 1`) |
| `build_prompt(question, records, now=None)` | User prompt. Pass the retrieved `memories` / `people` rows as dicts. It drops anything not verified, archived, conflicting or outside `valid_from`/`valid_until` (Manila time), so retrieval mistakes can't leak unverified facts |
| `complete(prompt, system)` | Ollama `/api/generate`, `LLM_TIMEOUT_S` (8 s). Raises `LLMUnavailable` on timeout, connection error, bad status or empty reply. `answer_mode = 'llm'` |
| `build_fallback_answer(records, language, caregiver, now=None)` | Call on `LLMUnavailable`. Same records, plain template sentences, no model call. `answer_mode = 'fallback'` |
| `no_data_reply(language, caregiver)` | When retrieval found no usable records: "I don't have that saved yet. You can ask Ana." `answer_mode = 'no_data'` |
| `transcribe(path)` | `POST /assistant/voice`. Returns `""` for silence or noise ("Sorry, I didn't catch that" + text box). Raises `AudioUnreadable` (bad file) or `STTLoadError` (model missing) |

`main.py` calls `app.ai.startup()` after migrate/seed: it loads Whisper once, runs it on 1 s of silence (first voice question ~3-4 s instead of ~13 s), and sends Ollama a warm-up prompt. Any failure there only logs a warning; the hub still starts.

Language: `fil` gets Filipino wording, `en` and `fil-en` (the seed default) get English. Unknown values are treated as `fil-en`.

## AI-1

MODULE FROM: AI Services
Task: Ollama client
Owner: N/A
Goal: Fill in `ai/llm.py` with `complete(prompt)` calling Ollama `/api/generate`, an ~8 second timeout, and a warm-up call at startup.
Priority: P0
Dependencies: HUB-1
Acceptance Criteria:
- [x] `complete()` returns the model's text using `OLLAMA_URL` and `LLM_MODEL` from config
- [x] A timeout or connection error raises one known exception the caller can catch (`LLMUnavailable`)
- [x] The warm-up runs at startup and a failure there does not stop the hub
Status: DONE. Covered by `tests/test_llm.py`, `test_startup.py`, `test_app.py` and the property tests (mocked Ollama). Not yet run against a real Ollama: run `python -m pytest -m integration` with Ollama started.

## AI-2

MODULE FROM: AI Services
Task: Grounded prompt
Owner: N/A
Goal: Fill in `ai/prompts.py` with the system prompt and a builder that turns retrieved records into prompt context.
Priority: P0
Dependencies: AI-1
Acceptance Criteria:
- [x] The prompt tells the model to answer only from the supplied records and to say so when they are not enough
- [x] Answers are short, plain and in the patient's language setting
- [ ] A question the records do not cover gets "I don't have that saved" rather than an invented answer, checked on at least five test questions (`tests/integration/test_llm_grounding.py` has them; needs a real Ollama run)
Status: DONE in code; the five-question check needs a run with Ollama and `qwen2.5:3b`.

## AI-3

MODULE FROM: AI Services
Task: Fallback answers
Owner: N/A
Goal: Fill in `ai/fallback.py` to join retrieved records into a plain sentence when Ollama is down or slow.
Priority: P1
Dependencies: AI-1
Acceptance Criteria:
- [x] Given the same records as the LLM path, it returns a readable answer with no model call
- [x] It never adds facts that are not in the records
- [x] It handles one record and several records
Status: DONE. `tests/test_fallback.py` plus property tests 8-12.

## AI-4

MODULE FROM: AI Services
Task: Speech-to-text
Owner: N/A
Goal: Fill in `ai/stt.py` with `transcribe(path)` using faster-whisper, loading the model once at startup.
Priority: P1
Dependencies: HUB-1
Acceptance Criteria:
- [x] The model named by `WHISPER_MODEL` loads once, not per request
- [ ] A clear English recording and a clear Filipino recording both transcribe correctly. English checked with the real `small` model on a synthesized (Windows TTS) clip: "Who is Ana?" gives "Who is Anna?". Still needs a real voice at `tests/fixtures/audio/en_clear.wav`. Filipino needs a team recording at `tests/fixtures/audio/fil_clear.wav`
- [x] Silence or noise returns an empty result the caller can detect (`""`; checked with the real model)
- [x] The audio format produced by the phone recorder is accepted (AAC `.m4a`, the expo-av HIGH_QUALITY preset; checked with the real model)
Status: DONE in code; Filipino accuracy is unverified until a recording is added.

Note for AST (08): Whisper writes "Ana" as "Anna". `intent.py` / `retrieve.py` should match names loosely (nickname and spelling variants), or `who_is` will miss.
