// schedules local notifications from /schedule + meds

import { Cache } from './cache';
import {
  Dose,
  DoseLog,
  DoseStatus,
  HubUnreachable,
  KeyValueStore,
  LocalNotification,
  Medication,
  Notifier,
  ScheduleOccurrence,
  formatHubDate,
  parseHubTime,
} from './hub';
import { Queue, QueuedAction } from './queue';

export const REFRESH_MS = 30 * 60 * 1000;
export const WINDOW_MS = 24 * 60 * 60 * 1000;
export const SNOOZE_MS = 10 * 60 * 1000;
// How long after the start an item with no duration still shows in the banner.
const DEFAULT_SHOWN_MS = 15 * 60 * 1000;

// Every notification this module schedules carries this prefix, so a refresh
// can cancel its own and leave anything else alone.
const ID_PREFIX = 'rem:';
const SNOOZES_KEY = 'reminders:snoozes';
const CONFIRMED_KEY = 'reminders:confirmed';
const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']; // index = Date.getDay()

// What the patient answered is also kept here, not only in the queue: once the queue
// has sent an answer, the cached schedule still shows it unanswered until the next refresh.

/** occurrence key → ISO time of the next reminder, or null when there should be none (Okay, or Later tapped at the start). */
export type Snoozes = Record<string, string | null>;

export const occurrenceKey = (o: Pick<ScheduleOccurrence, 'id' | 'occurrence_at'>) =>
  `${o.id}@${o.occurrence_at}`;
// medication_logs is UNIQUE (medication_id, due_at), so this names a dose with or without a log id.
export const doseKey = (d: Pick<Dose, 'medication_id' | 'due_at'>) => `${d.medication_id}@${d.due_at}`;
export const scheduleNotificationId = (o: Pick<ScheduleOccurrence, 'id' | 'occurrence_at'>) =>
  `${ID_PREFIX}sch:${occurrenceKey(o)}`;
export const doseNotificationId = (d: Pick<Dose, 'medication_id' | 'due_at'>) =>
  `${ID_PREFIX}med:${doseKey(d)}`;

const clock = (at: Date) =>
  at.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });

/**
 * The doses due on one date, worked out from each medicine's times the same way the hub
 * does when it creates that day's logs (medications/service.py is_due_on). Needed because
 * GET /medications/today has no logs for tomorrow yet.
 */
export function dosesDueOn(medications: Medication[], date: string): Dose[] {
  const weekday = WEEKDAYS[parseHubTime(date).getDay()];
  const doses: Dose[] = [];
  for (const med of medications) {
    if (!med.is_active) continue;
    if (med.start_date && date < med.start_date) continue;
    if (med.end_date && date > med.end_date) continue;
    for (const time of med.times) {
      if (time.days !== 'daily' && !time.days.split(',').includes(weekday)) continue;
      doses.push({
        id: null,
        medication_id: med.id,
        due_at: `${date} ${time.time_of_day}:00`,
        status: 'unconfirmed',
        name: med.name,
        dose: med.dose,
        instructions: med.instructions,
        photo_path: med.photo_path,
      });
    }
  }
  return doses.sort((a, b) => a.due_at.localeCompare(b.due_at) || a.name.localeCompare(b.name));
}

/** The patient's latest response to each occurrence: the hub's, overridden by anything still queued. */
function latestResponses(occurrences: ScheduleOccurrence[], pending: QueuedAction[]) {
  const responses = new Map<string, string>();
  for (const o of occurrences) if (o.ack) responses.set(occurrenceKey(o), o.ack.response);
  for (const a of pending) {
    if (a.type === 'ack') {
      responses.set(occurrenceKey({ id: a.itemId, occurrence_at: a.occurrenceAt }), a.response);
    }
  }
  return responses;
}

// 'snoozed' is not final: the patient asked to be reminded again.
const isAnswered = (response: string | undefined) =>
  response === 'acknowledged' || response === 'dismissed';

/** `confirmed` holds dose keys the patient answered on this phone. */
function unconfirmed(doses: Dose[], pending: QueuedAction[], confirmed: string[] = []) {
  const done = new Set([
    ...confirmed,
    ...pending.flatMap((a) => (a.type === 'dose' ? [doseKey({ medication_id: a.medicationId, due_at: a.dueAt })] : [])),
  ]);
  return doses.filter((d) => d.status === 'unconfirmed' && !done.has(doseKey(d)));
}

/** The notifications that should exist right now: one per unanswered reminder in the next 24 hours. */
export function buildPlan(input: {
  occurrences: ScheduleOccurrence[];
  doses: Dose[];
  pending: QueuedAction[];
  snoozes: Snoozes;
  confirmed?: string[];
  now: Date;
}): LocalNotification[] {
  const { occurrences, doses, pending, snoozes, now } = input;
  const end = now.getTime() + WINDOW_MS;
  const inWindow = (at: Date) => at.getTime() > now.getTime() && at.getTime() <= end;
  const responses = latestResponses(occurrences, pending);
  const plan: LocalNotification[] = [];

  for (const o of occurrences) {
    const key = occurrenceKey(o);
    if (isAnswered(responses.get(key))) continue;
    const snoozedUntil = snoozes[key];
    if (snoozedUntil === null) continue;
    const at = snoozedUntil ? new Date(snoozedUntil) : parseHubTime(o.remind_at);
    if (!inWindow(at)) continue;
    plan.push({
      id: scheduleNotificationId(o),
      title: o.title,
      body: `Starts at ${clock(parseHubTime(o.occurrence_at))}`,
      at,
      data: { type: 'schedule', itemId: o.id, occurrenceAt: o.occurrence_at },
    });
  }

  for (const d of unconfirmed(doses, pending, input.confirmed)) {
    const at = parseHubTime(d.due_at);
    if (!inWindow(at)) continue;
    plan.push({
      id: doseNotificationId(d),
      title: 'Time for your medicine',
      body: [d.name, d.dose, d.instructions].filter(Boolean).join(', '),
      at,
      data: { type: 'dose', medicationId: d.medication_id, dueAt: d.due_at },
    });
  }

  return plan.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Schedule reminders the banner should be showing now: reminded, not yet over, not answered. */
export function dueReminders(input: {
  occurrences: ScheduleOccurrence[];
  pending: QueuedAction[];
  snoozes: Snoozes;
  now: Date;
}): ScheduleOccurrence[] {
  const { occurrences, pending, snoozes, now } = input;
  const responses = latestResponses(occurrences, pending);
  return occurrences.filter((o) => {
    const key = occurrenceKey(o);
    if (isAnswered(responses.get(key))) return false;
    const snoozedUntil = snoozes[key];
    if (snoozedUntil === null) return false;
    const from = snoozedUntil ? new Date(snoozedUntil) : parseHubTime(o.remind_at);
    const start = parseHubTime(o.occurrence_at);
    const until = o.ends_at ? parseHubTime(o.ends_at) : new Date(start.getTime() + DEFAULT_SHOWN_MS);
    return from.getTime() <= now.getTime() && now.getTime() < until.getTime();
  });
}

/** Today's doses whose time has come and that nobody has confirmed, for the medication card. */
export function dueDoses(input: {
  doses: Dose[];
  pending: QueuedAction[];
  confirmed?: string[];
  now: Date;
}): Dose[] {
  return unconfirmed(input.doses, input.pending, input.confirmed).filter(
    (d) => parseHubTime(d.due_at).getTime() <= input.now.getTime(),
  );
}

export type Reminders = ReturnType<typeof createReminders>;

export function createReminders(deps: {
  cache: Cache;
  queue: Queue;
  notifier: Notifier;
  store: KeyValueStore;
  now?: () => Date;
}) {
  const { cache, queue, notifier, store } = deps;
  const now = deps.now ?? (() => new Date());

  async function loadSnoozes(): Promise<Snoozes> {
    const raw = await store.getItem(SNOOZES_KEY);
    return raw ? JSON.parse(raw) : {};
  }

  const saveSnoozes = (snoozes: Snoozes) => store.setItem(SNOOZES_KEY, JSON.stringify(snoozes));

  async function loadConfirmed(): Promise<string[]> {
    const raw = await store.getItem(CONFIRMED_KEY);
    return raw ? JSON.parse(raw) : [];
  }

  const saveConfirmed = (keys: string[]) => store.setItem(CONFIRMED_KEY, JSON.stringify(keys));

  async function sync(occurrences: ScheduleOccurrence[], doses: Dose[]) {
    // Local answers for occurrences and doses that are no longer fetched have done their job.
    const live = new Set(occurrences.map(occurrenceKey));
    const snoozes = Object.fromEntries(
      Object.entries(await loadSnoozes()).filter(([key]) => live.has(key)),
    );
    await saveSnoozes(snoozes);
    const liveDoses = new Set(doses.map(doseKey));
    const confirmed = (await loadConfirmed()).filter((key) => liveDoses.has(key));
    await saveConfirmed(confirmed);

    const plan = buildPlan({
      occurrences,
      doses,
      pending: await queue.pending(),
      snoozes,
      confirmed,
      now: now(),
    });
    // Cancel first, then schedule, so a changed or removed item never leaves a duplicate behind.
    for (const id of await notifier.scheduledIds()) {
      if (id.startsWith(ID_PREFIX)) await notifier.cancel(id);
    }
    for (const notification of plan) await notifier.schedule(notification);
    return plan;
  }

  let refreshing: Promise<{ reachable: boolean; scheduled: number }> | null = null;

  async function doRefresh() {
    await queue.flush();
    const today = now();
    const tomorrow = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
    const days = [formatHubDate(today), formatHubDate(tomorrow)];
    try {
      // Two days, because the next 24 hours run past midnight.
      const [s1, s2, logs, meds] = await Promise.all([
        cache.schedule(days[0]),
        cache.schedule(days[1]),
        cache.doses(),
        cache.medications(),
      ]);
      // Hub unreachable: what is already scheduled on the phone stays as it is.
      if (s1.stale || s2.stale || logs.stale || meds.stale) return { reachable: false, scheduled: 0 };
      // The hub has logs for today only; tomorrow's doses come from the medicines' times.
      const doses = [...logs.data, ...dosesDueOn(meds.data, days[1])];
      const plan = await sync([...s1.data, ...s2.data], doses);
      return { reachable: true, scheduled: plan.length };
    } catch (error) {
      if (error instanceof HubUnreachable) return { reachable: false, scheduled: 0 };
      throw error;
    }
  }

  /** Fetch the next 24 hours from the hub and replace this module's notifications with them. */
  function refresh() {
    if (!refreshing) {
      refreshing = doRefresh().finally(() => {
        refreshing = null;
      });
    }
    return refreshing;
  }

  async function todayFromCache(): Promise<{ occurrences: ScheduleOccurrence[]; doses: Dose[] }> {
    const date = formatHubDate(now());
    const [schedule, logs, meds] = await Promise.all([
      cache.peek<ScheduleOccurrence[]>(`schedule:${date}`),
      cache.peek<DoseLog[]>(`doses:${date}`),
      cache.peek<Medication[]>('medications'),
    ]);
    return {
      occurrences: schedule?.data ?? [],
      // No logs cached for today means the hub has been off since yesterday.
      doses: logs?.data ?? dosesDueOn(meds?.data ?? [], date),
    };
  }

  return {
    refresh,

    /** Refresh now and every 30 minutes while the app is open. Returns a function that stops it. */
    start(): () => void {
      const run = () => void refresh().catch(() => undefined);
      run();
      const timer = setInterval(run, REFRESH_MS);
      return () => clearInterval(timer);
    },

    /** What to show now, read from the phone only so it works with the hub off. */
    async due(): Promise<{ reminders: ScheduleOccurrence[]; doses: Dose[] }> {
      const [{ occurrences, doses }, pending, snoozes, confirmed] = await Promise.all([
        todayFromCache(),
        queue.pending(),
        loadSnoozes(),
        loadConfirmed(),
      ]);
      return {
        reminders: dueReminders({ occurrences, pending, snoozes, now: now() }),
        doses: dueDoses({ doses, pending, confirmed, now: now() }),
      };
    },

    /** Okay: the patient saw the reminder. It does not mean the activity was done. */
    async okay(occurrence: ScheduleOccurrence): Promise<void> {
      await queue.enqueue({
        type: 'ack',
        itemId: occurrence.id,
        occurrenceAt: occurrence.occurrence_at,
        response: 'acknowledged',
      });
      await saveSnoozes({ ...(await loadSnoozes()), [occurrenceKey(occurrence)]: null });
      await notifier.cancel(scheduleNotificationId(occurrence));
      void queue.flush();
    },

    /** Later: remind once more in 10 minutes, or at the start time if that comes first. */
    async later(occurrence: ScheduleOccurrence): Promise<void> {
      await queue.enqueue({
        type: 'ack',
        itemId: occurrence.id,
        occurrenceAt: occurrence.occurrence_at,
        response: 'snoozed',
      });
      const start = parseHubTime(occurrence.occurrence_at);
      const at = new Date(Math.min(now().getTime() + SNOOZE_MS, start.getTime()));
      const again = at.getTime() > now().getTime();
      await saveSnoozes({
        ...(await loadSnoozes()),
        [occurrenceKey(occurrence)]: again ? at.toISOString() : null,
      });
      if (again) {
        await notifier.schedule({
          id: scheduleNotificationId(occurrence),
          title: occurrence.title,
          body: `Starts at ${clock(start)}`,
          at,
          data: { type: 'schedule', itemId: occurrence.id, occurrenceAt: occurrence.occurrence_at },
        });
      } else {
        await notifier.cancel(scheduleNotificationId(occurrence));
      }
      void queue.flush();
    },

    /** For the medication card: records what the patient tapped, online or not. Pass a dose from `due()`. */
    async confirmDose(dose: Pick<Dose, 'id' | 'medication_id' | 'due_at'>, status: DoseStatus): Promise<void> {
      await queue.enqueue({
        type: 'dose',
        logId: dose.id,
        medicationId: dose.medication_id,
        dueAt: dose.due_at,
        status,
      });
      await saveConfirmed([...new Set([...(await loadConfirmed()), doseKey(dose)])]);
      await notifier.cancel(doseNotificationId(dose));
      void queue.flush();
    },
  };
}
