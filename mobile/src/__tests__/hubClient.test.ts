// the real HTTP client, replaying responses recorded from the hub

import { HubRejected, HubUnreachable } from '../hub';
import { createHubClient } from '../hubClient';
import { makePhone } from '../testing/fakes';
import { TODAY, dosesToday, medications, profile, schedule } from '../testing/fixtures';
import writes from '../testing/recorded/writes.json';

type Call = { method: string; url: string; headers: Record<string, string>; body?: unknown };

/** A fetch that answers from a table of 'METHOD path' → [status, body], and records each call. */
function fakeFetch(routes: Record<string, [number, unknown]>) {
  const calls: Call[] = [];
  const fetch = async (url: string, init: { method: string; headers: Record<string, string>; body?: string }) => {
    calls.push({ method: init.method, url, headers: init.headers, body: init.body && JSON.parse(init.body) });
    const route = routes[`${init.method} ${url.replace('http://hub:8000', '')}`];
    if (!route) throw new Error(`unexpected request ${init.method} ${url}`);
    const [status, body] = route;
    return { ok: status >= 200 && status < 300, status, json: async () => body };
  };
  return { fetch, calls };
}

const client = (routes: Record<string, [number, unknown]>, baseUrl: string | null = 'http://hub:8000/') => {
  const { fetch, calls } = fakeFetch(routes);
  return { hub: createHubClient({ baseUrl: () => baseUrl, fetch }), calls };
};

describe('requests', () => {
  test('reads use the real paths and send the patient role header', async () => {
    const { hub, calls } = client({
      [`GET /schedule/today?date=${TODAY}`]: [200, schedule[TODAY]],
      'GET /medications/today': [200, dosesToday],
      'GET /medications': [200, medications],
      'GET /patient': [200, profile],
      'GET /people': [200, []],
    });

    expect(await hub.getSchedule(TODAY)).toEqual(schedule[TODAY]);
    expect(await hub.getDosesToday()).toEqual(dosesToday);
    expect(await hub.getMedications()).toEqual(medications);
    expect(await hub.getProfile()).toEqual(profile);
    expect(await hub.getPeople()).toEqual([]);

    expect(calls.map((c) => `${c.method} ${c.url}`)).toEqual([
      `GET http://hub:8000/schedule/today?date=${TODAY}`,
      'GET http://hub:8000/medications/today',
      'GET http://hub:8000/medications',
      'GET http://hub:8000/patient',
      'GET http://hub:8000/people',
    ]);
    expect(calls.every((c) => c.headers['X-Role'] === 'patient')).toBe(true);
  });

  test('writes send the bodies the hub expects', async () => {
    const { hub, calls } = client({
      'POST /schedule/item-1/ack': [writes.ack_ok.status, writes.ack_ok.body],
      'POST /medications/logs/log-1': [writes.dose_ok.status, writes.dose_ok.body],
    });

    await hub.postAck('item-1', `${TODAY} 18:00:00`, 'snoozed');
    await hub.postDose('log-1', 'skipped');

    expect(calls[0].body).toEqual({ occurrence_at: `${TODAY} 18:00:00`, response: 'snoozed' });
    expect(calls[1].body).toEqual({ status: 'skipped' });
    expect(calls[0].headers).toEqual({ 'X-Role': 'patient', 'Content-Type': 'application/json' });
  });

  test('an unset patient profile ({} from the hub) is null', async () => {
    const { hub } = client({ 'GET /patient': [200, {}] });
    expect(await hub.getProfile()).toBeNull();
  });

  test('photo URLs point at the hub photo folder', async () => {
    const { hub } = client({ 'GET /people': [200, []] });
    await hub.getPeople();
    expect(hub.photoUrl('ana.jpg')).toBe('http://hub:8000/photos/ana.jpg');
  });
});

describe('errors', () => {
  test("the hub's real rejections become HubRejected with the status", async () => {
    const { hub } = client({
      'POST /schedule/nope/ack': [writes.ack_unknown_item.status, writes.ack_unknown_item.body],
      'POST /schedule/item-1/ack': [writes.ack_not_an_occurrence.status, writes.ack_not_an_occurrence.body],
      'POST /medications/logs/nope': [writes.dose_unknown.status, writes.dose_unknown.body],
    });

    await expect(hub.postAck('nope', `${TODAY} 18:00:00`, 'acknowledged')).rejects.toMatchObject({ name: 'HubRejected', status: 404 });
    await expect(hub.postAck('item-1', `${TODAY} 03:33:00`, 'acknowledged')).rejects.toMatchObject({ status: 422 });
    await expect(hub.postDose('nope', 'taken')).rejects.toBeInstanceOf(HubRejected);
  });

  test('server errors and busy replies count as unreachable, so the action is kept', async () => {
    for (const status of [500, 502, 503, 408, 429]) {
      const { hub } = client({ 'POST /medications/logs/log-1': [status, { detail: 'x' }] });
      await expect(hub.postDose('log-1', 'taken')).rejects.toBeInstanceOf(HubUnreachable);
    }
  });

  test('a network failure is unreachable', async () => {
    const hub = createHubClient({
      baseUrl: () => 'http://hub:8000',
      fetch: async () => {
        throw new TypeError('Network request failed');
      },
    });
    await expect(hub.getDosesToday()).rejects.toBeInstanceOf(HubUnreachable);
  });

  test('a hub that does not answer in time is unreachable', async () => {
    const hub = createHubClient({
      baseUrl: () => 'http://hub:8000',
      timeoutMs: 20,
      fetch: (_url, init) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    });
    await expect(hub.getDosesToday()).rejects.toBeInstanceOf(HubUnreachable);
  });

  test('no saved hub address is unreachable, without a request', async () => {
    const { hub, calls } = client({}, null);
    await expect(hub.getSchedule(TODAY)).rejects.toBeInstanceOf(HubUnreachable);
    expect(calls).toEqual([]);
  });
});

describe('the module on top of the real client', () => {
  test('refresh, Okay and a dose confirmation go out as real requests', async () => {
    const { fetch, calls } = fakeFetch({
      [`GET /schedule/today?date=${TODAY}`]: [200, schedule[TODAY]],
      'GET /schedule/today?date=2026-10-11': [200, schedule['2026-10-11']],
      'GET /medications/today': [200, dosesToday],
      'GET /medications': [200, medications],
      [`POST /schedule/${schedule[TODAY][2].id}/ack`]: [200, writes.ack_ok.body],
      [`POST /medications/logs/${dosesToday[3].id}`]: [200, writes.dose_ok.body],
    });
    const phone = makePhone({ hub: createHubClient({ baseUrl: () => 'http://hub:8000', fetch }) });

    expect(await phone.reminders.refresh()).toEqual({ reachable: true, scheduled: 9 });
    await phone.reminders.okay(schedule[TODAY][2]);
    await phone.reminders.confirmDose(dosesToday[3], 'taken');
    await phone.queue.flush();

    const posts = calls.filter((c) => c.method === 'POST');
    expect(posts.map((c) => [c.url.replace('http://hub:8000', ''), c.body])).toEqual([
      [`/schedule/${schedule[TODAY][2].id}/ack`, { occurrence_at: `${TODAY} 12:00:00`, response: 'acknowledged' }],
      [`/medications/logs/${dosesToday[3].id}`, { status: 'taken' }],
    ]);
    expect(await phone.queue.pending()).toEqual([]);
  });
});
