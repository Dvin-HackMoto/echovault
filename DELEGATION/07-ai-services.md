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
- [ ] AI-1 Ollama client
- [ ] AI-2 Grounded prompt
- [ ] AI-3 Fallback answers
- [ ] AI-4 Speech-to-text

Dependencies:
- Hub Foundation

Definition of Done:
- `complete(prompt)` returns text from the local model with no internet
- A slow or stopped Ollama produces a fallback answer instead of an error
- `transcribe(path)` returns text for an English or Filipino recording

## AI-1

MODULE FROM: AI Services
Task: Ollama client
Owner: N/A
Goal: Fill in `ai/llm.py` with `complete(prompt)` calling Ollama `/api/generate`, an ~8 second timeout, and a warm-up call at startup.
Priority: P0
Dependencies: HUB-1
Acceptance Criteria:
- [ ] `complete()` returns the model's text using `OLLAMA_URL` and `LLM_MODEL` from config
- [ ] A timeout or connection error raises one known exception the caller can catch
- [ ] The warm-up runs at startup and a failure there does not stop the hub
Status: TODO

## AI-2

MODULE FROM: AI Services
Task: Grounded prompt
Owner: N/A
Goal: Fill in `ai/prompts.py` with the system prompt and a builder that turns retrieved records into prompt context.
Priority: P0
Dependencies: AI-1
Acceptance Criteria:
- [ ] The prompt tells the model to answer only from the supplied records and to say so when they are not enough
- [ ] Answers are short, plain and in the patient's language setting
- [ ] A question the records do not cover gets "I don't have that saved" rather than an invented answer, checked on at least five test questions
Status: TODO

## AI-3

MODULE FROM: AI Services
Task: Fallback answers
Owner: N/A
Goal: Fill in `ai/fallback.py` to join retrieved records into a plain sentence when Ollama is down or slow.
Priority: P1
Dependencies: AI-1
Acceptance Criteria:
- [ ] Given the same records as the LLM path, it returns a readable answer with no model call
- [ ] It never adds facts that are not in the records
- [ ] It handles one record and several records
Status: TODO

## AI-4

MODULE FROM: AI Services
Task: Speech-to-text
Owner: N/A
Goal: Fill in `ai/stt.py` with `transcribe(path)` using faster-whisper, loading the model once at startup.
Priority: P1
Dependencies: HUB-1
Acceptance Criteria:
- [ ] The model named by `WHISPER_MODEL` loads once, not per request
- [ ] A clear English recording and a clear Filipino recording both transcribe correctly
- [ ] Silence or noise returns an empty result the caller can detect
- [ ] The audio format produced by the phone recorder is accepted
Status: TODO
