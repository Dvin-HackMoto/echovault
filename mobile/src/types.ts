// EchoVault mobile — row shapes mirroring the hub SQLite schema.
//
// There are NO DTOs on the backend: repositories return `dict(row)` straight
// from sqlite3.Row and routers accept `payload: dict`. So these types mirror
// the schema in backend/app/database/schema.sql directly. Enum string unions
// are copied verbatim from the schema CHECK constraints / app/constants.py.
// Nullable schema columns are modelled as `field?: T | null`.

// ─────────────────────────── enum string unions ───────────────────────────

/** memories/people/places.trust CHECK */
export type Trust = "verified" | "unverified" | "conflicting" | "outdated";

/** memories.importance CHECK */
export type Importance = "critical" | "important" | "general";

/** memories.category CHECK */
export type Category =
  | "identity"
  | "routine"
  | "history"
  | "preference"
  | "care_safety"
  | "engagement";

/** memories.validity CHECK */
export type Validity = "persistent" | "scheduled" | "temporary" | "archived";

/** medication_logs.status CHECK */
export type MedStatus = "unconfirmed" | "taken" | "skipped";

/** medication_logs.confirmed_by CHECK */
export type ConfirmedBy = "none" | "patient" | "caregiver";

/** X-Role header values (constants.ROLES) */
export type Role = "patient" | "caregiver";

/** caregivers.access_level CHECK */
export type AccessLevel = "admin" | "editor" | "viewer";

/** patient.language CHECK (constants.LANGUAGES) */
export type Language = "fil" | "en" | "fil-en";

/** schedule_items.kind CHECK */
export type ScheduleKind =
  | "appointment"
  | "routine"
  | "meal"
  | "visit"
  | "activity";

/** schedule_acks.response CHECK */
export type AckResponse = "acknowledged" | "dismissed" | "snoozed";

/** trivia_questions.kind CHECK */
export type TriviaKind = "general" | "personal" | "routine" | "family";

/** memories.source CHECK */
export type MemorySource = "caregiver" | "patient" | "ai_suggested" | "import";

/** trivia_questions.source CHECK */
export type TriviaSource = "preloaded" | "caregiver" | "generated";

/** activity_log.activity CHECK */
export type ActivityKind =
  | "family_matching"
  | "name_recall"
  | "event_recall"
  | "routine_recall"
  | "picture_matching"
  | "memory_quiz"
  | "trivia_prompt";

/** activity_log.outcome CHECK */
export type ActivityOutcome =
  | "completed"
  | "correct"
  | "incorrect"
  | "skipped"
  | "stopped";

/** assistant_log.input_mode CHECK */
export type InputMode = "text" | "voice";

/** assistant_log.answer_mode CHECK */
export type AnswerMode = "template" | "llm" | "fallback" | "no_data";

/** Allowed game/trivia topics (constants.ALLOWED_GAME_TOPICS). */
export type GameTopic =
  | "family_names"
  | "relationships"
  | "routines"
  | "familiar_places"
  | "recent_events";

/** game_difficulty is an int 1..3 (schema CHECK difficulty BETWEEN 1 AND 3). */
export type Difficulty = 1 | 2 | 3;

// ──────────────────────────── profile & access ────────────────────────────

export interface Patient {
  id: 1;
  full_name: string;
  preferred_name?: string | null;
  birth_date?: string | null;
  photo_path?: string | null;
  language: Language;
  font_scale: number;
  voice_enabled: number; // 0 | 1 (SQLite INTEGER boolean)
  managed_mode: number; // 0 | 1
  updated_at: string;
}

export interface Caregiver {
  id: string;
  name: string;
  relationship?: string | null;
  access_level: AccessLevel;
  pin_hash: string;
  is_active: number; // 0 | 1
  created_at: string;
}

/** Raw settings row (key -> JSON string). The parsed view is `SettingsValues`. */
export interface Settings {
  key: string;
  value: string;
  updated_at: string;
}

/** Parsed GET /settings response (constants.SETTINGS_DEFAULTS). */
export interface SettingsValues {
  game_topics: GameTopic[];
  game_difficulty: Difficulty;
  trivia_frequency_min: number;
  quiet_hours: { start: string; end: string };
}

// ──────────────────────────── people & places ────────────────────────────

export interface Person {
  id: string;
  name: string;
  nickname?: string | null;
  relationship: string;
  photo_path?: string | null;
  notes?: string | null;
  is_caregiver: number; // 0 | 1
  trust: Trust;
  created_by?: string | null;
  created_at: string;
  updated_at: string;
}

export interface Place {
  id: string;
  name: string;
  description?: string | null;
  address?: string | null;
  photo_path?: string | null;
  trust: Trust;
  updated_at: string;
}

// ─────────────────────────────── memories ────────────────────────────────

export interface Memory {
  id: string;
  title?: string | null;
  content: string;
  category: Category;
  importance: Importance;
  trust: Trust;
  validity: Validity;
  valid_from?: string | null;
  valid_until?: string | null;
  event_date?: string | null;
  person_id?: string | null;
  place_id?: string | null;
  photo_path?: string | null;
  source: MemorySource;
  conflicts_with?: string | null;
  verified_by?: string | null;
  verified_at?: string | null;
  created_at: string;
  updated_at: string;
}

// ─────────────────────────── schedule & routine ───────────────────────────

export interface ScheduleItem {
  id: string;
  title: string;
  kind: ScheduleKind;
  starts_at: string;
  duration_min?: number | null;
  recurrence?: string | null; // null | 'daily' | 'weekly:MO,WE' | 'monthly:15'
  ends_on?: string | null;
  person_id?: string | null;
  place_id?: string | null;
  notes?: string | null;
  remind_before_min: number;
  is_quiet_period: number; // 0 | 1
  is_active: number; // 0 | 1
  updated_at: string;
}

export interface ScheduleAck {
  id: string;
  schedule_item_id: string;
  occurrence_at: string;
  response: AckResponse;
  responded_at: string;
}

// ─────────────────────────────── medications ──────────────────────────────

export interface Medication {
  id: string;
  name: string;
  dose: string;
  instructions?: string | null;
  photo_path?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_active: number; // 0 | 1
  created_by?: string | null;
  updated_at: string;
}

export interface MedicationTime {
  id: string;
  medication_id: string;
  time_of_day: string; // "08:00"
  days: string; // 'daily' | 'MO,WE,FR'
}

export interface MedicationLog {
  id: string;
  medication_id: string;
  due_at: string;
  status: MedStatus;
  confirmed_by: ConfirmedBy;
  responded_at?: string | null;
  note?: string | null;
}

/**
 * medication_logs joined to the medication name/dose, as returned in the
 * dashboard `medication_attention` list (verified in dashboard/router.py).
 */
export interface MedicationLogWithMed extends MedicationLog {
  medication_name: string;
  medication_dose: string;
}

// ──────────────────────────── games & trivia ──────────────────────────────

export interface TriviaQuestion {
  id: string;
  kind: TriviaKind;
  topic?: string | null;
  question: string;
  answer: string;
  choices?: string | null; // JSON array string, or null for open recall
  memory_id?: string | null;
  difficulty: Difficulty;
  source: TriviaSource;
  is_active: number; // 0 | 1
}

export interface ActivityLog {
  id: string;
  activity: ActivityKind;
  topic?: string | null;
  question_ref?: string | null;
  outcome: ActivityOutcome;
  difficulty?: number | null;
  duration_sec?: number | null;
  created_at: string;
}

// ─────────────────────────────── assistant log ────────────────────────────

export interface AssistantLog {
  id: string;
  question: string;
  input_mode: InputMode;
  intent?: string | null; // who_is | next_event | medication | general
  answer: string;
  answer_mode: AnswerMode;
  memory_ids?: string | null; // JSON array string of records used
  flagged: number; // 0 | 1
  created_at: string;
}
