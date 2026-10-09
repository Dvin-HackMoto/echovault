// REM-3 Queued actions

import { HubUnreachable } from '../hub';
import { NewAction } from '../queue';
import { makePhone } from '../testing/fakes';
import { TODAY, breakfast, losartanMorning, lunch, metforminMorning, walk } from '../testing/fixtures';

const ack = (o: { id: string; occurrence_at: string }, response: 'acknowledged' | 'snoozed'): NewAction => ({
  type: 'ack',
  itemId: o.id,
  occurrenceAt: o.occurrence_at,
  response,
});
const dose = (d: { id: string; medication_id: string; due_at: string }, status: 'taken' | 'skipped'): NewAction => ({
  type: 'dose',
  logId: d.id,
  medicationId: d.medication_id,
  dueAt: d.due_at,
  status,
});

describe('queue', () => {
  test('an action taken offline is stored and survives an app restart', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.queue.enqueue(ack(breakfast, 'acknowledged'));
    await phone.queue.flush();

    phone.restart();
    const pending = await phone.queue.pending();
    expect(pending).toHaveLength(1);
    expect(pending[0]).toMatchObject({ type: 'ack', itemId: breakfast.id, response: 'acknowledged' });
    expect(phone.hub.received).toEqual([]);
  });

  test('queued actions are sent in order when the hub is reachable again', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.queue.enqueue(ack(lunch, 'snoozed'));
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));
    await phone.queue.enqueue(ack(lunch, 'acknowledged'));
    await phone.queue.enqueue(dose(metforminMorning, 'skipped'));
    await phone.queue.flush();
    phone.restart();

    phone.hub.online = true;
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([
      `ack ${lunch.id} snoozed`,
      `dose ${losartanMorning.id} taken`,
      `ack ${lunch.id} acknowledged`,
      `dose ${metforminMorning.id} skipped`,
    ]);
    // The later response to the same occurrence is the one the hub ends up with.
    expect(phone.hub.schedule[TODAY].find((o) => o.id === lunch.id)!.ack?.response).toBe('acknowledged');
  });

  test('a queued action is sent once and then removed', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));

    phone.hub.online = true;
    await phone.queue.flush();
    await phone.queue.flush();
    phone.restart();
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`dose ${losartanMorning.id} taken`]);
    expect(await phone.queue.pending()).toEqual([]);
  });

  test('flushes asked for at the same time do not send an action twice', async () => {
    const phone = makePhone();
    await phone.queue.enqueue(ack(breakfast, 'acknowledged'));
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));

    await Promise.all([phone.queue.flush(), phone.queue.flush(), phone.queue.flush()]);
    expect(phone.hub.received).toEqual([`ack ${breakfast.id} acknowledged`, `dose ${losartanMorning.id} taken`]);
  });

  test('if the hub drops out part-way, the rest stays queued in order', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.queue.enqueue(ack(breakfast, 'acknowledged'));
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));
    await phone.queue.enqueue(ack(lunch, 'acknowledged'));

    phone.hub.online = true;
    const postDose = jest.spyOn(phone.hub, 'postDose').mockRejectedValueOnce(new HubUnreachable());
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`ack ${breakfast.id} acknowledged`]);
    expect((await phone.queue.pending()).map((a) => a.type)).toEqual(['dose', 'ack']);

    postDose.mockRestore();
    await phone.queue.flush();
    expect(phone.hub.received).toEqual([
      `ack ${breakfast.id} acknowledged`,
      `dose ${losartanMorning.id} taken`,
      `ack ${lunch.id} acknowledged`,
    ]);
  });

  test('an action the hub rejects is dropped and does not block the rest', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    // 404: the caregiver deleted the item. 422: its time was changed. 409: the caregiver already recorded the dose.
    await phone.queue.enqueue({ type: 'ack', itemId: 'deleted-item', occurrenceAt: `${TODAY} 09:00:00`, response: 'acknowledged' });
    await phone.queue.enqueue({ type: 'ack', itemId: walk.id, occurrenceAt: `${TODAY} 09:00:00`, response: 'acknowledged' });
    await phone.queue.enqueue(dose(metforminMorning, 'taken'));
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));
    phone.hub.logs.find((d) => d.id === metforminMorning.id)!.confirmed_by = 'caregiver';

    phone.hub.online = true;
    await phone.queue.flush();

    expect(phone.hub.attempts).toHaveLength(4);
    expect(phone.hub.received).toEqual([`dose ${losartanMorning.id} taken`]);
    expect(await phone.queue.pending()).toEqual([]);
  });

  test('an action added while a flush is running is not lost', async () => {
    const phone = makePhone();
    await phone.queue.enqueue(ack(breakfast, 'acknowledged'));

    const flushing = phone.queue.flush();
    await phone.queue.enqueue(dose(losartanMorning, 'taken'));
    await flushing;
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`ack ${breakfast.id} acknowledged`, `dose ${losartanMorning.id} taken`]);
    expect(await phone.queue.pending()).toEqual([]);
  });
});

describe('the day in the Definition of Done', () => {
  test('reminder fires with the hub off, screens read the cache, offline responses arrive later', async () => {
    // 07:00: Lola Nena opens the app at home, hub on.
    const phone = makePhone();
    await phone.reminders.refresh();
    await phone.cache.profile();
    await phone.cache.people();

    // The laptop hub is switched off, and the app is closed.
    phone.hub.online = false;
    phone.restart();

    // 07:15: the morning walk reminder fires on the phone anyway.
    phone.clock.set(`${TODAY} 07:15:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toEqual(['Morning walk']);

    // She taps it. The app opens, cannot reach the hub, and shows the cached screens.
    expect(await phone.reminders.refresh()).toEqual({ reachable: false, scheduled: 0 });
    const home = await phone.cache.profile();
    const schedule = await phone.cache.schedule();
    const people = await phone.cache.people();
    expect([home.stale, schedule.stale, people.stale]).toEqual([true, true, true]);
    expect(home.data?.preferred_name).toBe('Lola Nena');
    expect(schedule.data).toHaveLength(6);
    expect(people.data[0]).toMatchObject({ name: 'Ana Santos', photo_uri: 'file:///photos/p-ana-ana.jpg' });

    // The banner shows breakfast (still on) and the walk; she taps Okay on both.
    expect((await phone.reminders.due()).reminders.map((o) => o.title)).toEqual(['Breakfast', 'Morning walk']);
    await phone.reminders.okay(breakfast);
    await phone.reminders.okay(walk);
    expect((await phone.reminders.due()).reminders).toEqual([]);

    // 08:00: the Losartan reminder fires; she taps "I took it" on the medication card.
    phone.clock.set(`${TODAY} 08:00:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toEqual(['medicine: Amlodipine', 'medicine: Losartan']);
    await phone.reminders.confirmDose(losartanMorning, 'taken');

    // 11:32: the lunch reminder has fired; she taps Later. The app is closed again.
    phone.clock.set(`${TODAY} 11:32:00`);
    phone.notifier.deliver(phone.clock.now());
    await phone.reminders.later(lunch);
    await phone.queue.flush();
    phone.restart();
    expect(phone.hub.received).toEqual([]);
    expect(await phone.queue.pending()).toHaveLength(4);

    // 11:42: the snoozed reminder fires, still with no hub.
    phone.clock.set(`${TODAY} 11:42:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toEqual(['Lunch']);

    // The hub comes back; the next refresh delivers everything, in order, once.
    phone.hub.online = true;
    expect((await phone.reminders.refresh()).reachable).toBe(true);
    await phone.reminders.refresh();
    expect(phone.hub.received).toEqual([
      `ack ${breakfast.id} acknowledged`,
      `ack ${walk.id} acknowledged`,
      `dose ${losartanMorning.id} taken`,
      `ack ${lunch.id} snoozed`,
    ]);
    expect(await phone.queue.pending()).toEqual([]);
    expect(phone.hub.schedule[TODAY][0].ack?.response).toBe('acknowledged');
    expect(phone.hub.logs.find((d) => d.id === losartanMorning.id)).toMatchObject({ status: 'taken', confirmed_by: 'patient' });
    expect((await phone.cache.schedule()).stale).toBe(false);
  });
});
