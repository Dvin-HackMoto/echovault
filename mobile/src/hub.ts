// what Reminders and Offline needs from the hub, and from the phone
//
// reminders.ts, cache.ts and queue.ts only talk to these interfaces. hubClient.ts is
// the real HubApi (HTTP to the hub); platform.ts has the real phone adapters (Expo).
// The row types below are the hub's actual JSON; src/testing/recorded/ holds responses
// captured from the hub code, and contract.test.ts fails if these types drift from them.

/** Network error, timeout or 5xx: the hub may accept the same request later. */
export class HubUnreachable extends Error {
  constructor(message = "Can't reach the hub") {
    super(message);
    this.name = 'HubUnreachable';
  }
}

/** 4xx: the hub answered and will never accept this request. */
export class HubRejected extends Error {
  constructor(public status: number, message = `Hub rejected the request (${status})`) {
    super(message);
    this.name = 'HubRejected';
  }
}

export type AckResponse = 'acknowledged' | 'dismissed' | 'snoozed';
export type DoseStatus = 'taken' | 'skipped';

/** A schedule_acks row. */
export type ScheduleAck = {
  id: string;
  schedule_item_id: string;
  occurrence_at: string;
  response: AckResponse;
  responded_at: string;
};

/** One row of GET /schedule/today: a schedule_items row, its linked names, and its dated fields. */
export type ScheduleOccurrence = {
  id: string;
  title: string;
  kind: 'appointment' | 'routine' | 'meal' | 'visit' | 'activity';
  starts_at: string;
  duration_min: number | null;
  recurrence: string | null;
  ends_on: string | null;
  person_id: string | null;
  place_id: string | null;
  notes: string | null;
  remind_before_min: number;
  is_quiet_period: number;
  is_active: number;
  updated_at: string;
  person_name: string | null;
  person_relationship: string | null;
  person_photo_path: string | null;
  place_name: string | null;
  occurrence_at: string; // 'YYYY-MM-DD HH:MM:SS', Manila local time
  ends_at: string | null;
  remind_at: string;
  ack: ScheduleAck | null;
};

/** One row of GET /medications/today: a medication_logs row joined with its medication. */
export type DoseLog = {
  id: string;
  medication_id: string;
  due_at: string;
  status: 'unconfirmed' | DoseStatus;
  confirmed_by: 'none' | 'patient' | 'caregiver';
  responded_at: string | null;
  note: string | null;
  name: string;
  dose: string;
  instructions: string | null;
  photo_path: string | null;
  time_of_day: string;
  photo_url: string | null;
};

/** One row of GET /medications. */
export type Medication = {
  id: string;
  name: string;
  dose: string;
  instructions: string | null;
  photo_path: string | null;
  start_date: string | null;
  end_date: string | null;
  is_active: number;
  created_by: string | null;
  updated_at: string;
  times: { id: string; medication_id: string; time_of_day: string; days: string }[];
  photo_url: string | null;
};

/**
 * A dose the phone reminds about. `id` is the medication_logs id, or null when the hub
 * has not created the log yet (it creates a day's logs on that day), in which case the
 * dose was worked out on the phone from the medication's times.
 */
export type Dose = Pick<
  DoseLog,
  'medication_id' | 'due_at' | 'status' | 'name' | 'dose' | 'instructions' | 'photo_path'
> & { id: string | null };

/** A people row. No people endpoint exists yet (PPL-1); this follows schema.sql. */
export type Person = {
  id: string;
  name: string;
  nickname: string | null;
  relationship: string;
  photo_path: string | null;
  notes: string | null;
  is_caregiver: number;
  /** Set by cache.ts: the copy saved on the phone, or the hub URL if saving failed. */
  photo_uri?: string | null;
};

/** The patient row from GET /patient. */
export type PatientProfile = {
  id: number;
  full_name: string;
  preferred_name: string | null;
  birth_date: string | null;
  photo_path: string | null;
  language: string;
  font_scale: number;
  voice_enabled: number;
  managed_mode: number;
  updated_at: string;
};

export interface HubApi {
  /** GET /schedule/today?date=YYYY-MM-DD */
  getSchedule(date: string): Promise<ScheduleOccurrence[]>;
  /** GET /medications/today. The hub decides what "today" is; there is no date parameter. */
  getDosesToday(): Promise<DoseLog[]>;
  /** GET /medications (the patient gets active medicines only) */
  getMedications(): Promise<Medication[]>;
  /** GET /people */
  getPeople(): Promise<Person[]>;
  /** GET /patient. Null until a caregiver has created the profile (the hub returns {}). */
  getProfile(): Promise<PatientProfile | null>;
  /** POST /schedule/{id}/ack {occurrence_at, response} */
  postAck(itemId: string, occurrenceAt: string, response: AckResponse): Promise<void>;
  /** POST /medications/logs/{id} {status} */
  postDose(logId: string, status: DoseStatus): Promise<void>;
  /** photo_path is a file name in the hub's photo folder, served at /photos/<photo_path>. */
  photoUrl(photoPath: string): string;
}

/** The part of AsyncStorage this module uses. */
export interface KeyValueStore {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
  removeItem(key: string): Promise<void>;
  getAllKeys(): Promise<readonly string[]>;
}

export type LocalNotification = {
  id: string;
  title: string;
  body: string;
  at: Date;
  data: Record<string, string>;
};

export interface Notifier {
  /** Scheduling an id that already exists replaces it. */
  schedule(notification: LocalNotification): Promise<void>;
  cancel(id: string): Promise<void>;
  scheduledIds(): Promise<string[]>;
}

/** Photos saved on the phone, addressed by file name. */
export interface FileStore {
  list(): Promise<string[]>;
  download(url: string, name: string): Promise<void>;
  remove(name: string): Promise<void>;
  uri(name: string): string;
}

const pad = (n: number) => String(n).padStart(2, '0');

/** Hub times have no zone; the phone's clock is assumed to be on Manila time like the hub. */
export function parseHubTime(value: string): Date {
  const [date, time = '00:00:00'] = value.split(/[ T]/);
  const [y, m, d] = date.split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = time.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

export function formatHubDate(at: Date): string {
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function formatHubTime(at: Date): string {
  return `${formatHubDate(at)} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}
