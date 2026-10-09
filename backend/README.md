# EchoVault hub (backend)

The FastAPI hub that runs on the laptop. Both phones talk to it over the local Wi-Fi or hotspot; it needs no internet once installed.

## Setup

Run everything from `backend/`. Python 3.10 is the minimum. Create and activate a virtual environment, install the requirements, then copy `.env.example` to `.env`.

Windows:

```
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements-dev.txt
copy .env.example .env
```

macOS/Linux:

```
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
```

`requirements-dev.txt` installs the hub plus pytest. Every value in `.env` has a working default, so the file is optional.

## Run the hub

From `backend/`, with the virtual environment active:

```
uvicorn app.main:app --host 0.0.0.0
```

On startup the hub creates `storage/` (the SQLite database and `storage/photos/`), applies `app/database/schema.sql`, loads and warms up the Whisper model, sends Ollama a warm-up prompt, and prints its LAN address, for example `http://192.168.1.5:8000`. Enter that address on the phones.

`--host 0.0.0.0` is what makes the hub reachable from the phones.

### Check the connection

The phone and the laptop must be on the same Wi-Fi network or hotspot. Open `<LAN address>/health` in the phone's browser, for example `http://192.168.1.5:8000/health`. A working connection shows `{"status":"ok"}`.

If the phone cannot connect, the laptop's firewall is probably blocking it. Allow Python through the firewall for private networks, then open `/health` again.

## Demo data

The demo data is one patient (Lola Nena), two caregivers, her family with placeholder photos, a daily routine, appointments, medications and memories. It also includes records for the caregiver dashboard: unverified memories, a conflicting pair and an outdated one.

- **On startup:** set `DEMO_MODE=true` in `.env`.
- **By hand:** `python -m app.database.seed`
- **Turn it off:** set `DEMO_MODE=false`. Rows already inserted stay; remove them with `--clear` below, or delete `storage/` to start empty.
- **Remove it, keep real data:** set `DEMO_MODE=false`, then run `python -m app.database.seed --clear`. It prints how many rows it removed per table.

Seeding only adds rows that are missing, so it is safe to run again and never overwrites edits.

`--clear` deletes only the rows with demo ids, plus the logs attached to them (for example dose logs of a demo medicine). It keeps every other row, the patient profile and any setting a caregiver has changed, and any demo photo that was replaced. If a real row still points at a demo caregiver (for example a person created while logged in as Ana), it removes nothing and names the row to fix first. Use `--clear` once real data has been entered next to the demo; delete `storage/` only when nothing in it needs keeping.

| Caregiver        | Access | Demo PIN |
|------------------|--------|----------|
| Ana Santos-Reyes | admin  | 1234     |
| Liza Cruz        | editor | 5678     |

The one-off appointments use fixed dates (20 and 25 October 2026). Move them forward in `app/database/seed.py` before a demo, then delete `storage/` and seed again.

## Tests

From `backend/`:

```
python -m pytest
```

The tests need neither Ollama nor Whisper. Each test gets its own temporary database and photo folder, so `storage/` is left unchanged.

## For feature owners

- **Routers:** define `router = APIRouter(prefix="/people", tags=["people"])` in `app/features/<name>/router.py`. The hub finds and registers it on startup; do not edit `main.py`.
- **Database:** take `db: sqlite3.Connection = Depends(get_db)` from `app.database.connection`. Rows are `sqlite3.Row`; return `dict(row)`. Each statement is committed as it runs. For changes that must happen together, wrap them in `db.execute("BEGIN")` and `db.execute("COMMIT")`.
- **Roles:** from `app.middleware.dependencies`, use `Depends(get_role)` on endpoints both modes may call and `Depends(require_caregiver)` on every write or management endpoint. `require_caregiver` returns the caregiver as a dict (`id`, `name`, `relationship`, `access_level`).
- **Enums and paths:** import them from `app.constants` and `app.config`; do not hard-code them.
- **Photos:** save files in `config.PHOTO_DIR` and store only the file name in `photo_path`. The phone loads it from `/photos/<photo_path>`.
- **Timestamps:** `updated_at` is only set on insert. Set it yourself on every update with `datetime('now','localtime')`.
- **Demo data:** never depend on seed ids (`seed-...`) or demo names such as Lola Nena, in feature code or in tests. The demo seed is only for demos and manual testing and can be cleared at any time; `tests/test_no_seed_coupling.py` fails if `app/` mentions it.
- **Test data:** build it with `tests/factories.py` (`make_person(db)`, `make_memory(db, trust=...)`, `make_medication(db, times=("08:00",))`...). Each call inserts one valid row with a fresh id and takes any column as an override. For caregiver endpoints, use the `caregiver` fixture (an active admin) and `caregiver_client_headers`; for patient requests, `PATIENT_HEADERS`.

## Local models

Both models run on the laptop. Each needs internet once to download; after that the hub works offline.

### Ollama (LLM)

1. Install Ollama from [ollama.com/download](https://ollama.com/download):
   - **Windows / macOS:** run the installer. The app also starts the Ollama server in the background.
   - **Linux:** `curl -fsSL https://ollama.com/install.sh | sh`
2. Start the server (skip this if the Windows or macOS app is already running):

   ```
   ollama serve
   ```

3. In another terminal, pull the default model. This needs internet once:

   ```
   ollama pull qwen2.5:3b
   ```

The hub expects Ollama at `http://localhost:11434`. Change `OLLAMA_URL` in `.env` only if Ollama runs somewhere else.

### Changing the model

The default model is `qwen2.5:3b`. To use another one:

1. Pull it: `ollama pull <model>` (for example `ollama pull gemma3:4b`).
2. Set `LLM_MODEL` in `.env` to exactly the same name, for example `LLM_MODEL=gemma3:4b`.
3. Restart the hub.

### Whisper (speech to text)

`WHISPER_MODEL` in `.env` sets the speech-to-text model size. The default is `small`; the allowed sizes are `tiny`, `base`, `small` and `medium` (smaller is faster, larger is more accurate). faster-whisper downloads the model on first use, which needs internet once, so run the hub with internet once before going offline.

If Ollama is stopped or slower than `LLM_TIMEOUT_S` (8 s), the hub still starts and the assistant answers from `app/ai/fallback.py` templates built from the same records. If Whisper can't load, voice questions retry the load on first use; text questions are unaffected.

### Checking the AI services with the real models

The default `python -m pytest` run never touches Ollama or Whisper. To check them for real (Ollama running with the model pulled, Whisper downloaded once):

```
python -m pytest -m integration
```

- `tests/integration/test_llm_grounding.py` asks the model 5 questions the demo records don't cover (each must get the "I don't have that saved" reply) and 2 they do cover.
- `tests/integration/test_stt_audio.py` transcribes `tests/fixtures/audio/en_clear.wav` ("Who is Ana?") and `fil_clear.wav` ("Sino si Ana?"), plus an optional `phone_sample.m4a` recorded on the phone. Add these recordings first; each test skips with a message until its file exists.

Tests whose service isn't available are skipped with a message saying why, not failed.
