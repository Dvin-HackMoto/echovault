// last-fetched schedule/people in AsyncStorage

import {
  DoseLog,
  FileStore,
  Medication,
  HubApi,
  HubUnreachable,
  KeyValueStore,
  PatientProfile,
  Person,
  ScheduleOccurrence,
  formatHubDate,
} from './hub';

/** `stale` means the hub could not be reached and `data` is the last copy saved at `cachedAt`. */
export type Cached<T> = { data: T; stale: boolean; cachedAt: string };

export type Cache = ReturnType<typeof createCache>;

const PREFIX = 'cache:';
const DATED = /^cache:(schedule|doses):(\d{4}-\d{2}-\d{2})$/;

export function createCache(deps: {
  hub: HubApi;
  store: KeyValueStore;
  files: FileStore;
  now?: () => Date;
  /** Called after any fetch succeeds, e.g. to send queued actions. */
  onReachable?: () => void;
}) {
  const { hub, store, files } = deps;
  const now = deps.now ?? (() => new Date());

  async function peek<T>(name: string): Promise<Cached<T> | null> {
    const raw = await store.getItem(PREFIX + name);
    return raw ? { ...JSON.parse(raw), stale: true } : null;
  }

  // Hub first; the cache is only served when the hub is unreachable.
  async function read<T>(name: string, fetch: () => Promise<T>): Promise<Cached<T>> {
    let data: T;
    try {
      data = await fetch();
    } catch (error) {
      if (!(error instanceof HubUnreachable)) throw error;
      const cached = await peek<T>(name);
      if (!cached) throw error;
      return cached;
    }
    const cachedAt = now().toISOString();
    await store.setItem(PREFIX + name, JSON.stringify({ data, cachedAt }));
    deps.onReachable?.();
    return { data, stale: false, cachedAt };
  }

  // Schedule and doses are stored per date; days that have passed are never read again.
  async function dropPastDays() {
    const today = formatHubDate(now());
    for (const key of await store.getAllKeys()) {
      const match = DATED.exec(key);
      if (match && match[2] < today) await store.removeItem(key);
    }
  }

  const photoName = (person: Person) =>
    `${person.id}-${person.photo_path!.split(/[\\/]/).pop()}`.replace(/[^\w.-]/g, '_');

  // Photos are served by the hub, so each one is copied to the phone to show offline.
  async function savePhotos(people: Person[]): Promise<Person[]> {
    const hubUri = (p: Person) => (p.photo_path ? hub.photoUrl(p.photo_path) : null);
    let saved: Set<string>;
    try {
      saved = new Set(await files.list());
    } catch {
      return people.map((p) => ({ ...p, photo_uri: hubUri(p) }));
    }
    const wanted = new Set<string>();
    const result: Person[] = [];
    for (const person of people) {
      if (!person.photo_path) {
        result.push({ ...person, photo_uri: null });
        continue;
      }
      const name = photoName(person);
      try {
        if (!saved.has(name)) await files.download(hub.photoUrl(person.photo_path), name);
        wanted.add(name);
        result.push({ ...person, photo_uri: files.uri(name) });
      } catch {
        // Not saved this time; the next successful fetch tries again.
        result.push({ ...person, photo_uri: hubUri(person) });
      }
    }
    for (const name of saved) {
      if (!wanted.has(name)) await files.remove(name).catch(() => undefined);
    }
    return result;
  }

  async function dated<T>(kind: 'schedule' | 'doses', date: string, fetch: () => Promise<T>) {
    const result = await read(`${kind}:${date}`, fetch);
    if (!result.stale) await dropPastDays();
    return result;
  }

  return {
    peek,
    schedule: (date: string = formatHubDate(now())): Promise<Cached<ScheduleOccurrence[]>> =>
      dated('schedule', date, () => hub.getSchedule(date)),
    /** Today's dose logs. The hub has no date parameter, so they are filed under the phone's date. */
    doses: (): Promise<Cached<DoseLog[]>> => dated('doses', formatHubDate(now()), () => hub.getDosesToday()),
    medications: (): Promise<Cached<Medication[]>> => read('medications', () => hub.getMedications()),
    people: (): Promise<Cached<Person[]>> =>
      read('people', async () => savePhotos(await hub.getPeople())),
    profile: (): Promise<Cached<PatientProfile | null>> => read('profile', () => hub.getProfile()),
  };
}
