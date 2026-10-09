// runs the module against a real, running hub. Skipped unless ECHOVAULT_HUB_URL is set:
//
//   ECHOVAULT_HUB_URL=http://127.0.0.1:8000 npm test -- live
//
// It writes acknowledgements and dose confirmations, so point it at a demo hub only.
// The hub needs the schedule, medications and settings routers and at least one
// schedule item and one medicine due today.

import { HubUnreachable, formatHubDate, formatHubTime } from '../hub';
import { createHubClient } from '../hubClient';
import { makePhone } from '../testing/fakes';

const HUB_URL = process.env.ECHOVAULT_HUB_URL;
const live = HUB_URL ? describe : describe.skip;

live(`against the hub at ${HUB_URL}`, () => {
  // A switch in front of the real network, to play "hub off" without stopping the server.
  let online = true;
  const hub = createHubClient({
    baseUrl: () => HUB_URL!,
    fetch: (url, init) => {
      if (!online) throw new TypeError('Network request failed');
      return fetch(url, init);
    },
  });
  const today = formatHubDate(new Date());
  const phone = makePhone({ start: formatHubTime(new Date()), hub });

  beforeEach(() => {
    online = true;
  });

  test('every read endpoint answers', async () => {
    expect(Array.isArray(await hub.getSchedule(today))).toBe(true);
    expect(Array.isArray(await hub.getDosesToday())).toBe(true);
    expect(Array.isArray(await hub.getMedications())).toBe(true);
    await hub.getProfile();
  });

  test('refresh schedules the next 24 hours from the real schedule and medicines', async () => {
    const result = await phone.reminders.refresh();
    expect(result.reachable).toBe(true);
    expect(result.scheduled).toBeGreaterThan(0);

    const now = phone.clock.now().getTime();
    for (const n of phone.notifier.scheduled.values()) {
      expect(n.at.getTime()).toBeGreaterThan(now);
      expect(n.at.getTime()).toBeLessThanOrEqual(now + 24 * 60 * 60 * 1000);
    }
    console.log(`Scheduled from the live hub:\n  ${phone.notifier.summary().join('\n  ')}`);
  });

  test('Okay is stored by the hub as acknowledged', async () => {
    const [occurrence] = await hub.getSchedule(today);
    await phone.reminders.okay(occurrence);
    await phone.queue.flush();

    const after = (await hub.getSchedule(today)).find((o) => o.id === occurrence.id)!;
    expect(after.ack).toMatchObject({ response: 'acknowledged', occurrence_at: occurrence.occurrence_at });
    expect(await phone.queue.pending()).toEqual([]);
  });

  test('a dose confirmation is stored by the hub as taken by the patient', async () => {
    const dose = (await hub.getDosesToday()).find((d) => d.confirmed_by !== 'caregiver')!;
    await phone.reminders.confirmDose(dose, 'taken');
    await phone.queue.flush();

    const after = (await hub.getDosesToday()).find((d) => d.id === dose.id)!;
    expect(after).toMatchObject({ status: 'taken', confirmed_by: 'patient' });
    expect(await phone.queue.pending()).toEqual([]);
  });

  test('responses made with the hub off reach it, in order, when it is back', async () => {
    const occurrence = (await hub.getSchedule(today))[1];
    const doses = (await hub.getDosesToday()).filter((d) => d.confirmed_by !== 'caregiver');
    const dose = doses[doses.length - 1];

    online = false;
    await expect(hub.getDosesToday()).rejects.toBeInstanceOf(HubUnreachable);
    await phone.reminders.later(occurrence);
    // No log id, as when the dose was worked out on the phone: the hub's log is looked up on send.
    await phone.reminders.confirmDose({ id: null, medication_id: dose.medication_id, due_at: dose.due_at }, 'skipped');
    await phone.queue.flush();
    expect((await phone.queue.pending()).map((a) => a.type)).toEqual(['ack', 'dose']);
    expect(await phone.reminders.refresh()).toEqual({ reachable: false, scheduled: 0 });

    online = true;
    expect((await phone.reminders.refresh()).reachable).toBe(true);
    expect(await phone.queue.pending()).toEqual([]);
    expect((await hub.getSchedule(today)).find((o) => o.id === occurrence.id)!.ack?.response).toBe('snoozed');
    expect((await hub.getDosesToday()).find((d) => d.id === dose.id)).toMatchObject({
      status: 'skipped',
      confirmed_by: 'patient',
    });
  });

  test('responses the hub refuses are dropped and do not block the queue', async () => {
    const [occurrence] = await hub.getSchedule(today);
    await phone.queue.enqueue({ type: 'ack', itemId: 'no-such-item', occurrenceAt: occurrence.occurrence_at, response: 'acknowledged' });
    await phone.queue.enqueue({ type: 'ack', itemId: occurrence.id, occurrenceAt: `${today} 03:33:00`, response: 'acknowledged' });
    await phone.queue.enqueue({ type: 'dose', logId: 'no-such-log', medicationId: 'x', dueAt: `${today} 08:00:00`, status: 'taken' });
    await phone.queue.enqueue({ type: 'ack', itemId: occurrence.id, occurrenceAt: occurrence.occurrence_at, response: 'dismissed' });
    await phone.queue.flush();

    expect(await phone.queue.pending()).toEqual([]);
    expect((await hub.getSchedule(today)).find((o) => o.id === occurrence.id)!.ack?.response).toBe('dismissed');
  });
});
