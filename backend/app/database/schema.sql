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
