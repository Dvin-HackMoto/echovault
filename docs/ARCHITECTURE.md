# EchoVault — Architecture

## Tech Stack

| Layer    | Technology                                   |
|----------|----------------------------------------------|
| Frontend | React Native (Expo)                          |
| Backend  | Python FastAPI                               |
| Database | SQLite (+ FTS5 for memory search)            |
| LLM      | Ollama (local model, e.g. Qwen2.5-3B / Gemma 3 4B) |
| STT      | faster-whisper (local)                       |
| TTS      | expo-speech (on the phone)                   |

The backend runs on a **laptop hub** over a local Wi-Fi network or hotspot with **no internet**. Both phones (patient and caregiver) talk to the hub over the LAN.

---

## Directory Structure

```
echovault/
├── backend/
│   ├── app/
│   │   ├── main.py                  # FastAPI app, CORS, registers routers, runs migrate() on startup
│   │   ├── config.py                # DB_PATH, PHOTO_DIR, OLLAMA_URL, LLM_MODEL, WHISPER_MODEL (.env)
│   │   ├── constants.py             # categories, importance, trust, validity, med statuses, roles
│   │   │
│   │   ├── database/
│   │   │   ├── connection.py        # sqlite3 connect, row_factory=sqlite3.Row, get_db dependency
│   │   │   ├── schema.sql           # tables + memories_fts
│   │   │   └── seed.py              # demo patient, family, routine, meds, memories, photos
│   │   │
│   │   ├── features/
│   │   │   ├── auth/
│   │   │   │   ├── router.py        # POST /auth/pin (caregiver), GET /auth/me
│   │   │   │   └── service.py       # hash/check PIN
│   │   │   ├── people/
│   │   │   │   ├── router.py        # CRUD + POST /people/{id}/photo
│   │   │   │   ├── service.py       # validation; verified / by-name / fallback-caregiver lookups
│   │   │   │   ├── photos.py        # save, replace, remove photo files (shared with places)
│   │   │   │   └── repository.py
│   │   │   ├── places/
│   │   │   │   ├── router.py        # CRUD + POST /places/{id}/photo
│   │   │   │   ├── service.py
│   │   │   │   └── repository.py
│   │   │   ├── memories/
│   │   │   │   ├── router.py        # CRUD, POST /memories/{id}/verify, GET ?trust=&category=
│   │   │   │   ├── service.py       # conflict flagging, expire past valid_until
│   │   │   │   └── repository.py
│   │   │   ├── schedule/
│   │   │   │   ├── router.py        # CRUD, GET /schedule/today, GET /schedule/next
│   │   │   │   └── repository.py
│   │   │   ├── medications/
│   │   │   │   ├── router.py        # CRUD, POST /medications/logs/{id} (taken|skipped)
│   │   │   │   ├── service.py       # generate today's due logs as 'unconfirmed'
│   │   │   │   └── repository.py
│   │   │   ├── assistant/
│   │   │   │   ├── router.py        # POST /assistant/ask {text}, POST /assistant/voice (audio),
│   │   │   │   │                    #   GET /assistant/log, POST /assistant/log/{id}/flag (caregiver)
│   │   │   │   ├── intent.py        # rule-based: who_is | next_event | medication | general
│   │   │   │   ├── retrieve.py      # structured queries + FTS, verified & valid only
│   │   │   │   ├── answer.py        # templates for meds/schedule, LLM phrasing for the rest
│   │   │   │   └── repository.py    # assistant_log, and looking up the records an answer used
│   │   │   ├── games/
│   │   │   │   ├── router.py        # GET /games/{type}/round, POST /games/result
│   │   │   │   ├── generators.py    # build questions from verified people/memories/routine
│   │   │   │   └── repository.py    # activity_log
│   │   │   ├── trivia/
│   │   │   │   ├── router.py        # GET /trivia/next (respects quiet hours + appointments),
│   │   │   │   │                    #   POST /trivia/result, CRUD /trivia/questions
│   │   │   │   ├── service.py       # suppression rules, picking a question, validation
│   │   │   │   ├── loader.py        # trivia.json → trivia_questions on every startup
│   │   │   │   └── repository.py
│   │   │   ├── settings/
│   │   │   │   └── router.py        # game topics, difficulty, prompt frequency, quiet hours
│   │   │   ├── dashboard/
│   │   │   │   └── router.py        # unverified/conflicting counts, unconfirmed meds, activity
│   │   │   └── backup/
│   │   │       └── router.py        # GET /backup/export (zip: db + photos), POST /backup/import
│   │   │
│   │   ├── ai/
│   │   │   ├── llm.py               # complete(prompt) → Ollama /api/generate
│   │   │   ├── stt.py               # transcribe(path) → faster-whisper, loaded once at startup
│   │   │   ├── prompts.py           # "answer ONLY from these records" system prompt
│   │   │   └── fallback.py          # template answers if Ollama is down/slow
│   │   │
│   │   └── middleware/
│   │       └── dependencies.py      # get_role (patient|caregiver from header), require_caregiver
│   │
│   ├── assets/
│   │   └── trivia.json              # preloaded general trivia
│   ├── storage/                     # git-ignored
│   │   ├── echovault.db
│   │   └── photos/
│   ├── tests/
│   ├── requirements.txt             # fastapi, uvicorn, faster-whisper, httpx, python-multipart
│   ├── .env.example
│   └── README.md                    # ollama pull <model>, run uvicorn --host 0.0.0.0
│
└── mobile/                          # React Native (Expo)
    ├── app/
    │   ├── _layout.tsx
    │   ├── index.tsx                # splash, onboarding, hub IP setup, "who uses this phone"
    │   ├── (patient)/               # tabs: home, memories/, ask (Ask Kali), people/, schedule;
    │   │                            #   plus medications, games/, trivia, orientation, settings
    │   └── care/                    # caregiver app at /care (a real path, so its URLs never clash
    │                                #   with the patient's): PIN, overview, memories/, schedule
    │                                #   (routines + medication), people, more, profile,
    │                                #   activities, backup, hub
    ├── src/
    │   ├── api/client.ts            # fetch wrapper with hub base URL + role header
    │   ├── api/*.ts                 # one file per feature: people.ts, memories.ts, assistant.ts…
    │   ├── voice/record.ts          # expo-av recording → upload to /assistant/voice
    │   ├── voice/speak.ts           # expo-speech (TTS stays on the phone)
    │   ├── reminders.ts             # schedules local notifications from /schedule + meds
    │   ├── cache.ts                 # last-fetched schedule/people in AsyncStorage
    │   ├── queue.ts                 # acks and medication confirmations waiting for the hub
    │   ├── hub.ts                   # interfaces reminders/cache/queue use for the hub and the phone
    │   ├── hubClient.ts             # those hub calls over HTTP (schedule, medications, patient, people)
    │   ├── platform.ts              # wires those interfaces to Expo
    │   ├── useCached.ts             # hook for screens that read through the cache
    │   ├── testing/                 # recorded hub responses, fake hub and phone for tests
    │   ├── types.ts                 # plain row shapes, mirrors the DB
    │   ├── ui/                      # Kali design system (from frontend/): tokens, kit, labels,
    │   │                            #   prefs (language, text size), toast, useHub (load + cache)
    │   ├── caregiver/               # PIN screen, session (access level), forms, panels
    │   ├── patient/                 # patient context, medication + trivia cards, decisions
    │   ├── components/              # ReminderBanner, StaleNotice
    │   └── theme.ts                 # base tokens + font_scale (older components)
    ├── assets/kali/                 # Kali the elephant (from ASSETS/)
    └── package.json
```

**No DTOs:** there is no `schemas.py`. Repositories return `dict(row)` from `sqlite3.Row`, routers accept `payload: dict = Body(...)` and validate only required fields and enum values from `constants.py`. The only typing is `mobile/src/types.ts`.

---

## Data Storage

- **Memories and all structured records:** SQLite (`storage/echovault.db`)
- **Photos:** files in `storage/photos/`; only the path is stored in the DB
- **JSON:** `trivia.json`, `settings.value`, and backup bundles only
- **Prompt context:** built at query time from retrieved rows, never stored

---

## Database Schema

`backend/app/database/schema.sql`. Assumes **one patient per hub**.

> **Timestamps:** all times are stored in Manila local time (`YYYY-MM-DD HH:MM:SS`), so defaults and comparisons use `datetime('now','localtime')`.

```sql
PRAGMA foreign_keys = ON;   -- also set this on every connection in connection.py

-- ─────────────────────────── PROFILE & ACCESS ───────────────────────────

CREATE TABLE IF NOT EXISTS patient (
    id              INTEGER PRIMARY KEY CHECK (id = 1),     -- single row
    full_name       TEXT NOT NULL,
    preferred_name  TEXT,                                   -- "Lola Nena"
    birth_date      TEXT,
    photo_path      TEXT,
    language        TEXT NOT NULL DEFAULT 'fil-en',         -- fil | en | fil-en
    font_scale      REAL NOT NULL DEFAULT 1.4,
    voice_enabled   INTEGER NOT NULL DEFAULT 1,
    managed_mode    INTEGER NOT NULL DEFAULT 0,             -- simplified UI
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS caregivers (
    id              TEXT PRIMARY KEY,                       -- uuid
    name            TEXT NOT NULL,
    relationship    TEXT,                                   -- daughter, nurse…
    access_level    TEXT NOT NULL DEFAULT 'editor'
                    CHECK (access_level IN ('admin','editor','viewer')),
    pin_hash        TEXT NOT NULL,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS settings (
    key             TEXT PRIMARY KEY,                       -- 'game_topics', 'quiet_hours', 'trivia_frequency_min'
    value           TEXT NOT NULL,                          -- JSON
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─────────────────────────── PEOPLE & PLACES ────────────────────────────

CREATE TABLE IF NOT EXISTS people (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,
    nickname        TEXT,
    relationship    TEXT NOT NULL,                          -- daughter, grandson, neighbor
    photo_path      TEXT,
    notes           TEXT,                                   -- short, shown on PersonCard
    is_caregiver    INTEGER NOT NULL DEFAULT 0,             -- "ask Ana" fallback target
    trust           TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (trust IN ('verified','unverified','conflicting','outdated')),
    created_by      TEXT REFERENCES caregivers(id),
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS places (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,                          -- "Home", "Malolos Church"
    description     TEXT,
    address         TEXT,
    photo_path      TEXT,
    trust           TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (trust IN ('verified','unverified','conflicting','outdated')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

-- ─────────────────────────────── MEMORIES ───────────────────────────────

CREATE TABLE IF NOT EXISTS memories (
    id              TEXT PRIMARY KEY,
    title           TEXT,                                   -- "Ana's favorite flower"
    content         TEXT NOT NULL,                          -- "Ana loves sunflowers."
    category        TEXT NOT NULL
                    CHECK (category IN ('identity','routine','history','preference','care_safety','engagement')),
    importance      TEXT NOT NULL DEFAULT 'general'
                    CHECK (importance IN ('critical','important','general')),
    trust           TEXT NOT NULL DEFAULT 'unverified'
                    CHECK (trust IN ('verified','unverified','conflicting','outdated')),
    validity        TEXT NOT NULL DEFAULT 'persistent'
                    CHECK (validity IN ('persistent','scheduled','temporary','archived')),
    valid_from      TEXT,                                   -- for scheduled/temporary
    valid_until     TEXT,
    event_date      TEXT,                                   -- when it happened (history)
    person_id       TEXT REFERENCES people(id) ON DELETE SET NULL,
    place_id        TEXT REFERENCES places(id) ON DELETE SET NULL,
    photo_path      TEXT,
    source          TEXT NOT NULL DEFAULT 'caregiver'
                    CHECK (source IN ('caregiver','patient','ai_suggested','import')),
    conflicts_with  TEXT REFERENCES memories(id) ON DELETE SET NULL,
    verified_by     TEXT REFERENCES caregivers(id),
    verified_at     TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE INDEX IF NOT EXISTS idx_mem_lookup ON memories(trust, validity, category);
CREATE INDEX IF NOT EXISTS idx_mem_person ON memories(person_id);

-- keyword search over memories
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
    title, content, content='memories', content_rowid='rowid'
);
CREATE TRIGGER IF NOT EXISTS mem_ai AFTER INSERT ON memories BEGIN
    INSERT INTO memories_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;
CREATE TRIGGER IF NOT EXISTS mem_ad AFTER DELETE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
END;
CREATE TRIGGER IF NOT EXISTS mem_au AFTER UPDATE ON memories BEGIN
    INSERT INTO memories_fts(memories_fts, rowid, title, content) VALUES ('delete', old.rowid, old.title, old.content);
    INSERT INTO memories_fts(rowid, title, content) VALUES (new.rowid, new.title, new.content);
END;

-- ─────────────────────────── SCHEDULE & ROUTINE ─────────────────────────

CREATE TABLE IF NOT EXISTS schedule_items (
    id                TEXT PRIMARY KEY,
    title             TEXT NOT NULL,                        -- "Check-up with Dr. Cruz"
    kind              TEXT NOT NULL
                      CHECK (kind IN ('appointment','routine','meal','visit','activity')),
    starts_at         TEXT NOT NULL,                        -- first occurrence, local time
    duration_min      INTEGER,
    recurrence        TEXT,                                 -- NULL | 'daily' | 'weekly:MO,WE' | 'monthly:15'
    ends_on           TEXT,
    person_id         TEXT REFERENCES people(id) ON DELETE SET NULL,  -- who's visiting / with
    place_id          TEXT REFERENCES places(id) ON DELETE SET NULL,
    notes             TEXT,
    remind_before_min INTEGER NOT NULL DEFAULT 30,
    is_quiet_period   INTEGER NOT NULL DEFAULT 0,           -- blocks trivia popups
    is_active         INTEGER NOT NULL DEFAULT 1,
    updated_at        TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS schedule_acks (
    id               TEXT PRIMARY KEY,
    schedule_item_id TEXT NOT NULL REFERENCES schedule_items(id) ON DELETE CASCADE,
    occurrence_at    TEXT NOT NULL,                         -- which occurrence
    response         TEXT NOT NULL CHECK (response IN ('acknowledged','dismissed','snoozed')),
    responded_at     TEXT NOT NULL DEFAULT (datetime('now','localtime')),
    UNIQUE (schedule_item_id, occurrence_at)
);

-- ─────────────────────────────── MEDICATIONS ────────────────────────────

CREATE TABLE IF NOT EXISTS medications (
    id              TEXT PRIMARY KEY,
    name            TEXT NOT NULL,                          -- as written by caregiver/prescription
    dose            TEXT NOT NULL,                          -- "1 tablet", "5 ml"
    instructions    TEXT,                                   -- "after breakfast"
    photo_path      TEXT,                                   -- pill/box photo
    start_date      TEXT,
    end_date        TEXT,
    is_active       INTEGER NOT NULL DEFAULT 1,
    created_by      TEXT REFERENCES caregivers(id),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);

CREATE TABLE IF NOT EXISTS medication_times (
    id              TEXT PRIMARY KEY,
    medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    time_of_day     TEXT NOT NULL,                          -- "08:00"
    days            TEXT NOT NULL DEFAULT 'daily'           -- 'daily' | 'MO,WE,FR'
);

CREATE TABLE IF NOT EXISTS medication_logs (
    id              TEXT PRIMARY KEY,
    medication_id   TEXT NOT NULL REFERENCES medications(id) ON DELETE CASCADE,
    due_at          TEXT NOT NULL,
    status          TEXT NOT NULL DEFAULT 'unconfirmed'
                    CHECK (status IN ('unconfirmed','taken','skipped')),
    confirmed_by    TEXT NOT NULL DEFAULT 'none'
                    CHECK (confirmed_by IN ('none','patient','caregiver')),
    responded_at    TEXT,
    note            TEXT,
    UNIQUE (medication_id, due_at)
);

-- ──────────────────────────── GAMES & TRIVIA ────────────────────────────

CREATE TABLE IF NOT EXISTS trivia_questions (
    id              TEXT PRIMARY KEY,
    kind            TEXT NOT NULL CHECK (kind IN ('general','personal','routine','family')),
    topic           TEXT,                                   -- matches game_topics setting
    question        TEXT NOT NULL,
    answer          TEXT NOT NULL,
    choices         TEXT,                                   -- JSON array, NULL = open recall
    memory_id       TEXT REFERENCES memories(id) ON DELETE CASCADE,  -- personal ones must link to a verified memory
    difficulty      INTEGER NOT NULL DEFAULT 1 CHECK (difficulty BETWEEN 1 AND 3),
    source          TEXT NOT NULL DEFAULT 'preloaded'
                    CHECK (source IN ('preloaded','caregiver','generated')),
    is_active       INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE IF NOT EXISTS activity_log (
    id              TEXT PRIMARY KEY,
    activity        TEXT NOT NULL
                    CHECK (activity IN ('family_matching','name_recall','event_recall','routine_recall',
                                        'picture_matching','memory_quiz','trivia_prompt')),
    topic           TEXT,
    question_ref    TEXT,                                   -- trivia_questions.id / people.id, etc.
    outcome         TEXT NOT NULL
                    CHECK (outcome IN ('completed','correct','incorrect','skipped','stopped')),
    difficulty      INTEGER,
    duration_sec    INTEGER,
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_activity_time ON activity_log(created_at);

-- ───────────────────────────── ASSISTANT LOG ────────────────────────────

CREATE TABLE IF NOT EXISTS assistant_log (
    id              TEXT PRIMARY KEY,
    question        TEXT NOT NULL,
    input_mode      TEXT NOT NULL DEFAULT 'text' CHECK (input_mode IN ('text','voice')),
    intent          TEXT,                                   -- who_is | next_event | medication | general
    answer          TEXT NOT NULL,
    answer_mode     TEXT NOT NULL CHECK (answer_mode IN ('template','llm','fallback','no_data')),
    memory_ids      TEXT,                                   -- JSON array of records used
    flagged         INTEGER NOT NULL DEFAULT 0,             -- caregiver marks a bad answer
    created_at      TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
```

### Schema Design Notes

- **AI-suggested memories** don't need their own table. They're rows with `source='ai_suggested'` and `trust='unverified'`, so the caregiver dashboard just queries for that.
- **Conflicts** are handled with `conflicts_with`. When a new memory contradicts an existing one, both get `trust='conflicting'` and point to each other until a caregiver resolves it. The assistant never answers from conflicting rows.
- **Recurrence** stays as a simple string like `daily` or `weekly:MO,WE` rather than full RRULE. Expanding it in Python for "today" and "next" is about 20 lines of code.
- **Medication logs are created ahead of time.** A daily job (or the first request of the day) inserts `unconfirmed` rows from `medication_times`. That lets the dashboard show what was missed, and `confirmed_by` keeps "patient tapped it" separate from "caregiver confirmed it."
- **Every personal trivia question links to a memory** through `memory_id`. That enforces "only verified information" in one query, and deleting a memory also deletes its questions.
- **`assistant_log.memory_ids`** shows which records each answer came from — useful for demoing traceability and for caregivers fixing bad answers. Despite the name it holds the id of every record used, not only memories: people for `who_is`, schedule items for `next_event`, medications for `medication`. `GET /assistant/log` resolves each id back to its record.
- **Settings** stay as JSON values because they're read whole and never queried. Seed values:

```
game_topics:          ["family_names","relationships","routines"]
trivia_frequency_min: 120
quiet_hours:          {"start":"21:00","end":"07:00"}
game_difficulty:      1
```

### Core Retrieval Query

```sql
SELECT m.* FROM memories_fts f
JOIN memories m ON m.rowid = f.rowid
WHERE memories_fts MATCH :q
  AND m.trust = 'verified'
  AND m.validity != 'archived'
  AND (m.valid_until IS NULL OR m.valid_until >= datetime('now','localtime'))
  AND (m.valid_from  IS NULL OR m.valid_from  <= datetime('now','localtime'))
ORDER BY CASE m.importance WHEN 'critical' THEN 0 WHEN 'important' THEN 1 ELSE 2 END, rank
LIMIT 5;
```

---

## System Flow

### 0. Overall Architecture

```
┌──────────────────┐        local Wi-Fi / hotspot        ┌──────────────────────────────┐
│  Patient phone   │◄──────────── (no internet) ────────►│        Laptop hub            │
│  (RN, patient)   │                                     │  FastAPI ── SQLite (+FTS5)   │
└──────────────────┘                                     │     │       storage/photos/  │
┌──────────────────┐                                     │     ├── Ollama (local LLM)   │
│ Caregiver phone  │◄───────────────────────────────────►│     └── faster-whisper (STT) │
│ (RN, caregiver)  │                                     └──────────────────────────────┘
└──────────────────┘
```

- The hub is the single source of truth. Both phones read and write the same database.
- TTS, local notifications, and the offline cache run on the phones.

### 1. Hub Startup

1. Run `ollama serve`, then `uvicorn app.main:app --host 0.0.0.0`.
2. `main.py` runs `schema.sql` (migrate), loads `assets/trivia.json` into `trivia_questions` and, in demo mode, runs `seed.py`.
3. `stt.py` loads the Whisper model once into memory.
4. `llm.py` sends a warm-up prompt so the first real answer isn't slow.
5. The hub prints its LAN IP for the phones to connect to.

### 2. Device Setup and Mode Selection

1. On first launch, the app asks for the hub IP and saves it.
2. `index.tsx` shows the mode picker: Patient or Caregiver.
3. Patient mode opens directly. Every request sends the header `X-Role: patient`.
4. Caregiver mode asks for a PIN, checked via `POST /auth/pin`. The hub returns the caregiver id and `access_level`, and the app sends `X-Role: caregiver` and `X-Caregiver-Id` from then on.
5. `require_caregiver()` blocks patient-mode calls to any write or management endpoint.

### 3. Caregiver Setup (first use)

1. Create the patient profile and accessibility settings (`font_scale`, voice, `managed_mode`).
2. Add people with photos (`POST /people`, `POST /people/{id}/photo`). Photos go to `storage/photos/`; only the path is saved in the DB.
3. Add places, routines, appointments (`schedule_items`), and medications with their times.
4. Add memories, each with a category, importance, validity, and optional person or place.
5. Choose game topics, difficulty, trivia frequency, and quiet hours (`settings`).
6. Verify the records. Only verified records are used by the assistant, games, and trivia.

### 4. Memory Lifecycle

```
Created ──► unverified ──(caregiver verifies)──► verified ──► used in answers, games, trivia
                 │                                   │
                 │                    (valid_until passes) ──► outdated
                 │                                   │
                 └──(contradicts an existing memory)──► conflicting (both rows, linked by conflicts_with)
                                                     │
                 caregiver resolves: keep one ──► verified; the other ──► archived or outdated
```

- New memories can come from a caregiver, the patient, or an AI suggestion. Patient and AI entries always start as `unverified`.
- `memories/service.py` runs `expire_outdated()` on startup and on the first request of each day.
- Conflict check on save: same `person_id` + same category + a matching FTS hit → flag both rows.
- Safety-critical (`care_safety`) memories can only be created by a caregiver.

### 5. Ask Flow (text or voice)

1. **Input**
   - Text: the patient types → `POST /assistant/ask {text}`
   - Voice: hold-to-talk (expo-av) → `POST /assistant/voice` (audio file) → `stt.py` transcribes → the text continues through the same pipeline
2. **Intent** (`intent.py`, rule-based keywords, English and Filipino)
   - "gamot / medicine" → `medication`
   - "ano susunod / next / today / appointment" → `next_event`
   - "sino si / who is" → `who_is`
   - anything else → `general`
   - The rules run in that order and the first match wins, so "What is my next medicine?" is `medication`.
3. **Retrieve** (`retrieve.py`)
   - `who_is` → people by name/nickname + their verified, valid memories. If no verified person has that name, the name is searched in memories like a `general` question.
   - `next_event` → `schedule_items` expanded for today or the next occurrence. "next" gives the one next item, "today" what is still left today, and "appointment" the next item of kind `appointment`.
   - `medication` → `medications` + `medication_times` + today's `medication_logs`
   - `general` → FTS query on memories (verified, not archived, within validity)
4. **Answer** (`answer.py`)
   - `medication` / `next_event` → fixed template, no LLM involved. The medication answer lists today's doses, then the next one:
     > "Today you take Metformin, 1 tablet, at 8:00 AM, after breakfast (marked as taken) and Losartan, 1 tablet, at 8:00 PM, after dinner. Your next medicine is Losartan, 1 tablet, at 8:00 PM, after dinner."

     A confirmed dose is described as "marked as taken", never as taken. Templates follow `patient.language`: `fil` gives Filipino, `en` and `fil-en` English.
   - `who_is` / `general` with records → LLM rephrases **only** the retrieved records (`prompts.py`: use only these facts; if they're not enough, say so)
   - No verified records → `no_data` reply:
     > "I don't have that saved yet. You can ask Ana." (the `people` row with `is_caregiver = 1`)
   - Ollama down or timed out (~8s) → `fallback.py` joins the retrieved records into a plain sentence
5. **Log** to `assistant_log` (question, intent, answer, answer_mode, memory_ids). A recording with no words in it is answered with "Sorry, I didn't catch that" and is not looked up or logged.
6. **Respond** with `{answer, answer_mode, intent, people[] with photo URLs, memory_ids}` (voice adds `transcript`) → the phone shows the answer with photos and reads it aloud (expo-speech).
7. A caregiver can later review the answers (`GET /assistant/log`, each with the records it used), flag a wrong one (`POST /assistant/log/{id}/flag`, body `{"flagged": false}` to clear it) and fix the source memory.

### 6. Reminders (Schedule)

1. When the patient app opens, and every 30 minutes while it's open, it fetches `GET /schedule/today` and today's medication times.
2. `reminders.ts` cancels its old notifications and schedules new ones for the next 24 hours (`starts_at − remind_before_min`). It also saves the data to `cache.ts`.
3. The notification fires **on the phone**, even if the hub is off or out of range.
4. The patient taps Okay or Later → POST to `schedule_acks` (`acknowledged` or `snoozed`). If the hub is unreachable, the response is queued in AsyncStorage and sent later.
5. An acknowledgement means "the patient saw it," not "it was done."

### 7. Medication Flow

1. On the first request of the day, `medications/service.py` creates an `unconfirmed` `medication_logs` row for every active `medication_time` due today.
2. When a reminder fires, the patient app shows a big card with the medicine name, dose, instructions, and pill photo.
3. The patient taps "Nainom ko na / I took it" or "Skip" → `POST /medications/logs/{id}` (`status = taken|skipped`, `confirmed_by = patient`).
4. The caregiver dashboard shows doses still unconfirmed past `due_at`. The caregiver can confirm or correct them (`confirmed_by = caregiver`).
5. The system never marks a dose as taken on its own.

### 8. Memory Games

1. The patient opens Games, or the home screen suggests one if none has been played today.
2. `GET /games/{type}/round` → `generators.py` builds a round using only verified data from the caregiver's chosen topics and difficulty:
   - `family_matching` / `name_recall` ← people with photos
   - `event_recall` / `memory_quiz` ← history memories + linked `trivia_questions`
   - `routine_recall` ← routine `schedule_items` in time order
3. The phone plays the round with gentle feedback and always-visible Skip and Stop buttons.
4. `POST /games/result` → `activity_log` (outcome, topic, difficulty, duration).

### 9. Trivia and Memory Prompts

1. The patient app checks `GET /trivia/next` every `trivia_frequency_min` minutes while open.
2. `trivia/service.py` returns nothing if:
   - it's inside `quiet_hours`,
   - a schedule item is within ±30 min, or one has `is_quiet_period = 1`,
   - the last prompt was answered or skipped less than `trivia_frequency_min` ago.
3. Otherwise it picks an active question up to `game_difficulty`: personal ones (topic in `game_topics`, linked to a verified and currently valid memory) and general ones from `trivia.json` take turns. General trivia is always eligible; `game_topics` only filters the personal ones.
4. The phone shows a small dismissible card. The patient can answer, look at photos, or close it.
5. The phone reports the outcome with `POST /trivia/result` (`completed` or `skipped`), saved to `activity_log` (`activity = trivia_prompt`). Whether an answer was right is never stored. The frequency wait counts from this row.
6. A caregiver manages questions at `/trivia/questions`: write their own, and switch any question (preloaded ones included) off or on.

### 10. Caregiver Dashboard and Review

`GET /dashboard` returns:

- unverified memories (including AI suggestions) waiting for review
- conflicting pairs to resolve
- memories outdated in the last 7 days
- unconfirmed or skipped medication doses
- flagged assistant answers
- activity summary (which games and topics were played or skipped)

The caregiver acts on each item → the change is in the hub DB → the patient phone gets it on its next fetch. No separate sync step is needed.

Activity data is shown as engagement, never as a score or a cognitive measure.

### 11. Offline and Failure Handling

| Situation                | Behavior                                                                                       |
|--------------------------|------------------------------------------------------------------------------------------------|
| Hub unreachable          | Patient app shows cached home, schedule, and people; reminders still fire; Ask shows "Can't reach the helper right now." |
| Ollama down or slow      | `fallback.py` template answer built from the same records                                      |
| Whisper can't understand | "Sorry, I didn't catch that," plus a text box                                                  |
| No verified data         | `no_data` reply naming the caregiver                                                           |
| Queued patient actions   | Acks and medication confirmations retried when the hub is back                                 |

### 12. Backup and Restore

1. Caregiver → `GET /backup/export` → zip of `echovault.db` + `photos/` (optionally password-protected).
2. Saved to the caregiver's phone or the laptop.
3. `POST /backup/import` replaces the DB and photos after confirmation, then the hub re-runs `migrate()`.
