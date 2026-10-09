// the real HubApi: HTTP calls to the hub's schedule, medications, patient and people endpoints
//
// Uses its own fetch so this module works before src/api/client.ts (MOB-2) exists.
// It only needs the hub address, which MOB-2 saves on the phone:
//
//   const hub = createHubClient({ baseUrl: () => savedHubAddress });   // 'http://192.168.1.10:8000'

import {
  AckResponse,
  DoseLog,
  DoseStatus,
  HubApi,
  HubRejected,
  HubUnreachable,
  Medication,
  PatientProfile,
  Person,
  ScheduleOccurrence,
} from './hub';

const TIMEOUT_MS = 8000;
// The hub answered, but trying again later can succeed.
const RETRY_LATER = new Set([408, 425, 429]);

type Fetch = (
  url: string,
  init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal },
) => Promise<{ ok: boolean; status: number; json(): Promise<unknown> }>;

export function createHubClient(options: {
  /** The saved hub address, e.g. 'http://192.168.1.10:8000'. Read on every request so it can change. */
  baseUrl: () => string | null | Promise<string | null>;
  fetch?: Fetch;
  timeoutMs?: number;
}): HubApi & { baseUrl(): Promise<string> } {
  const doFetch: Fetch = options.fetch ?? ((url, init) => fetch(url, init));
  const timeoutMs = options.timeoutMs ?? TIMEOUT_MS;

  async function baseUrl(): Promise<string> {
    const saved = await options.baseUrl();
    if (!saved) throw new HubUnreachable('No hub address saved yet');
    return saved.replace(/\/+$/, '');
  }

  // Photo URLs are needed synchronously, so the last address used is remembered.
  let lastBase = '';

  // One request at a time. The hub on main opens a SQLite connection per request and
  // fails when two overlap (connection.py: created in one thread, closed in another).
  let inFlight: Promise<unknown> = Promise.resolve();
  function request<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    const run = inFlight.then(() => send<T>(method, path, body));
    inFlight = run.catch(() => undefined);
    return run;
  }

  async function send<T>(method: 'GET' | 'POST', path: string, body?: unknown): Promise<T> {
    lastBase = await baseUrl();
    const abort = new AbortController();
    const timer = setTimeout(() => abort.abort(), timeoutMs);
    let response;
    try {
      response = await doFetch(lastBase + path, {
        method,
        // This module only runs in patient mode.
        headers: { 'X-Role': 'patient', ...(body === undefined ? {} : { 'Content-Type': 'application/json' }) },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: abort.signal,
      });
    } catch {
      // No network, wrong address, or the timeout above.
      throw new HubUnreachable();
    } finally {
      clearTimeout(timer);
    }
    if (response.status >= 500 || RETRY_LATER.has(response.status)) throw new HubUnreachable();
    if (!response.ok) throw new HubRejected(response.status);
    try {
      return (await response.json()) as T;
    } catch {
      throw new HubUnreachable('The hub sent a reply that could not be read');
    }
  }

  return {
    baseUrl,
    getSchedule: (date) => request<ScheduleOccurrence[]>('GET', `/schedule/today?date=${encodeURIComponent(date)}`),
    getDosesToday: () => request<DoseLog[]>('GET', '/medications/today'),
    getMedications: () => request<Medication[]>('GET', '/medications'),
    getPeople: () => request<Person[]>('GET', '/people'),
    async getProfile() {
      const row = await request<PatientProfile | Record<string, never>>('GET', '/patient');
      return 'full_name' in row ? (row as PatientProfile) : null;
    },
    async postAck(itemId: string, occurrenceAt: string, response: AckResponse) {
      await request('POST', `/schedule/${encodeURIComponent(itemId)}/ack`, { occurrence_at: occurrenceAt, response });
    },
    async postDose(logId: string, status: DoseStatus) {
      await request('POST', `/medications/logs/${encodeURIComponent(logId)}`, { status });
    },
    photoUrl: (photoPath) => `${lastBase}/photos/${encodeURIComponent(photoPath)}`,
  };
}
