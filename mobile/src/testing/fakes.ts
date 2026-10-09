// in-memory stand-ins for the hub and the phone, for tests
//
// FakeHub exists so tests can switch the hub off and move the clock. It serves the
// recorded responses in fixtures.ts and follows the real hub's rules for writes.

import { createCache } from '../cache';
import {
  AckResponse,
  DoseLog,
  DoseStatus,
  FileStore,
  HubApi,
  HubRejected,
  HubUnreachable,
  KeyValueStore,
  LocalNotification,
  Medication,
  Notifier,
  PatientProfile,
  Person,
  ScheduleOccurrence,
  formatHubDate,
  formatHubTime,
  parseHubTime,
} from '../hub';
import { createQueue } from '../queue';
import { createReminders, doseKey, dosesDueOn } from '../reminders';
import * as fixtures from './fixtures';

const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));

export class FakeClock {
  private at: Date;
  constructor(start: string) {
    this.at = parseHubTime(start);
  }
  now = () => new Date(this.at);
  set(time: string) {
    this.at = parseHubTime(time);
  }
  advanceMinutes(minutes: number) {
    this.at = new Date(this.at.getTime() + minutes * 60_000);
  }
}

/** A hub that can be switched off. Writes change what it returns, with the real hub's status codes. */
export class FakeHub implements HubApi {
  online = true;
  schedule: Record<string, ScheduleOccurrence[]> = copy(fixtures.schedule);
  logs: DoseLog[] = copy(fixtures.dosesToday);
  medications: Medication[] = copy(fixtures.medications);
  people: Person[] = copy(fixtures.people);
  profile: PatientProfile | null = copy(fixtures.profile);
  /** Every write the hub accepted, in the order it arrived. */
  received: string[] = [];
  /** Every write that reached the hub, accepted or rejected. */
  attempts: string[] = [];

  constructor(private clock: { now: () => Date }) {}

  private reach() {
    if (!this.online) throw new HubUnreachable();
  }

  async getSchedule(date: string) {
    this.reach();
    return copy(this.schedule[date] ?? []);
  }

  // Like the hub: create any missing 'unconfirmed' logs for today, then list today's.
  async getDosesToday() {
    this.reach();
    const today = formatHubDate(this.clock.now());
    const have = new Set(this.logs.map(doseKey));
    for (const due of dosesDueOn(this.medications, today)) {
      if (have.has(doseKey(due))) continue;
      this.logs.push({
        ...due,
        id: `log:${doseKey(due)}`,
        confirmed_by: 'none',
        responded_at: null,
        note: null,
        time_of_day: due.due_at.slice(11, 16),
        photo_url: due.photo_path && `/photos/${due.photo_path}`,
      });
    }
    return copy(
      this.logs
        .filter((d) => d.due_at.startsWith(today))
        .sort((a, b) => a.due_at.localeCompare(b.due_at) || a.name.localeCompare(b.name)),
    );
  }

  async getMedications() {
    this.reach();
    return copy(this.medications.filter((m) => m.is_active));
  }

  async getPeople() {
    this.reach();
    return copy(this.people);
  }

  async getProfile() {
    this.reach();
    return copy(this.profile);
  }

  async postAck(itemId: string, occurrenceAt: string, response: AckResponse) {
    this.reach();
    this.attempts.push(`ack ${itemId} ${response}`);
    const all = Object.values(this.schedule).flat();
    if (!all.some((o) => o.id === itemId)) throw new HubRejected(404);
    const found = all.find((o) => o.id === itemId && o.occurrence_at === occurrenceAt);
    if (!found) throw new HubRejected(422);
    found.ack = {
      id: found.ack?.id ?? `ack:${itemId}@${occurrenceAt}`,
      schedule_item_id: itemId,
      occurrence_at: occurrenceAt,
      response,
      responded_at: formatHubTime(this.clock.now()),
    };
    this.received.push(`ack ${itemId} ${response}`);
  }

  async postDose(logId: string, status: DoseStatus) {
    this.reach();
    this.attempts.push(`dose ${logId} ${status}`);
    const found = this.logs.find((d) => d.id === logId);
    if (!found) throw new HubRejected(404);
    if (found.confirmed_by === 'caregiver') throw new HubRejected(409);
    found.status = status;
    found.confirmed_by = 'patient';
    found.responded_at = formatHubTime(this.clock.now());
    this.received.push(`dose ${logId} ${status}`);
  }

  photoUrl(photoPath: string) {
    return `http://192.168.1.10:8000/photos/${photoPath}`;
  }
}

export class FakeStore implements KeyValueStore {
  data = new Map<string, string>();
  async getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  async setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  async removeItem(key: string) {
    this.data.delete(key);
  }
  async getAllKeys() {
    return [...this.data.keys()];
  }
}

/** Holds scheduled notifications the way the phone's OS does: they outlive the app and the hub. */
export class FakeNotifier implements Notifier {
  scheduled = new Map<string, LocalNotification>();

  async schedule(notification: LocalNotification) {
    this.scheduled.set(notification.id, notification);
  }
  async cancel(id: string) {
    this.scheduled.delete(id);
  }
  async scheduledIds() {
    return [...this.scheduled.keys()];
  }

  /** Fire everything due at `now`, as the OS would. Returns what fired, as 'title' or 'medicine name'. */
  deliver(now: Date) {
    const due = [...this.scheduled.values()]
      .filter((n) => n.at.getTime() <= now.getTime())
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.body.localeCompare(b.body));
    for (const n of due) this.scheduled.delete(n.id);
    return due.map(label);
  }

  /** 'HH:MM label' for each scheduled notification, in time order. */
  summary() {
    return [...this.scheduled.values()]
      .sort((a, b) => a.at.getTime() - b.at.getTime() || a.body.localeCompare(b.body))
      .map((n) => `${formatHubTime(n.at).slice(11, 16)} ${label(n)}`);
  }
}

// Dose notifications share one title, so tests name them by the medicine in the body.
const label = (n: LocalNotification) => (n.data.type === 'dose' ? `medicine: ${n.body.split(',')[0]}` : n.title);

export class FakeFiles implements FileStore {
  saved = new Map<string, string>();
  downloads: string[] = [];
  failing = false;

  async list() {
    return [...this.saved.keys()];
  }
  async download(url: string, name: string) {
    if (this.failing) throw new Error('download failed');
    this.downloads.push(url);
    this.saved.set(name, url);
  }
  async remove(name: string) {
    this.saved.delete(name);
  }
  uri(name: string) {
    return `file:///photos/${name}`;
  }
}

/** A patient phone. `restart()` closes and reopens the app; storage and scheduled notifications survive. */
export function makePhone(options: { start?: string; hub?: HubApi } = {}) {
  const clock = new FakeClock(options.start ?? `${fixtures.TODAY} 07:00:00`);
  const fakeHub = new FakeHub(clock);
  const hub = options.hub ?? fakeHub;
  const store = new FakeStore();
  const notifier = new FakeNotifier();
  const files = new FakeFiles();

  function open() {
    const queue = createQueue({ hub, store, now: clock.now });
    const cache = createCache({ hub, store, files, now: clock.now, onReachable: () => void queue.flush() });
    const reminders = createReminders({ cache, queue, notifier, store, now: clock.now });
    return { queue, cache, reminders };
  }

  const phone = { clock, hub: fakeHub, store, notifier, files, ...open(), restart: () => void Object.assign(phone, open()) };
  return phone;
}
