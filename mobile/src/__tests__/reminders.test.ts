// REM-1 Local reminders

import { parseHubTime } from '../hub';
import { REFRESH_MS, buildPlan, doseNotificationId, dosesDueOn, scheduleNotificationId } from '../reminders';
import { makePhone } from '../testing/fakes';
import {
  TODAY,
  TOMORROW,
  amlodipineMorning,
  anaVisit,
  breakfast,
  breakfastTomorrow,
  losartanEvening,
  losartanMorning,
  lunch,
  massTomorrow,
  medications,
  metforminMorning,
  walk,
} from '../testing/fixtures';

// 07:00 on the recorded Saturday. Breakfast's 06:30 reminder and Metformin's 06:30 dose are already past.
const FULL_DAY = [
  '07:15 Morning walk',
  '08:00 medicine: Amlodipine',
  '08:00 medicine: Losartan',
  '11:30 Lunch',
  '13:00 Afternoon nap',
  '14:30 Ana visits',
  '17:30 Dinner',
  '20:00 medicine: Losartan',
  '06:30 Breakfast',
];

describe('scheduling', () => {
  test('notifications fire at starts_at − remind_before_min and at each dose time', async () => {
    const phone = makePhone();
    const result = await phone.reminders.refresh();

    expect(result).toEqual({ reachable: true, scheduled: 9 });
    expect(phone.notifier.summary()).toEqual(FULL_DAY);

    const dose = phone.notifier.scheduled.get(doseNotificationId(losartanMorning))!;
    expect(dose.at).toEqual(parseHubTime(`${TODAY} 08:00:00`));
    expect(dose.title).toBe('Time for your medicine');
    expect(dose.body).toBe('Losartan, 1 tablet, after meals');
    const visit = phone.notifier.scheduled.get(scheduleNotificationId(anaVisit))!;
    expect(anaVisit).toMatchObject({ starts_at: `${TODAY} 15:00:00`, remind_before_min: 30 });
    expect(visit.at).toEqual(parseHubTime(`${TODAY} 14:30:00`));
    expect(visit.body).toBe('Starts at 3:00 PM');
  });

  test('only the next 24 hours are scheduled, across midnight', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    const ids = [...phone.notifier.scheduled.keys()];

    // Already past at 07:00.
    expect(ids).not.toContain(scheduleNotificationId(breakfast));
    expect(ids).not.toContain(doseNotificationId(metforminMorning));
    // Tomorrow before 07:00 is inside the window; tomorrow after 07:00 is outside it.
    expect(ids).toContain(scheduleNotificationId(breakfastTomorrow));
    expect(ids).not.toContain(scheduleNotificationId(massTomorrow));
  });

  test("tomorrow's doses come from the medicines' times, since the hub has no logs for them yet", async () => {
    const phone = makePhone({ start: `${TODAY} 19:00:00` });
    await phone.reminders.refresh();

    // Metformin is MO,WE,FR,SA and tomorrow is a Sunday, so it is not among them.
    expect(phone.notifier.summary().filter((line) => line.includes('medicine'))).toEqual([
      '20:00 medicine: Losartan',
      '08:00 medicine: Amlodipine',
      '08:00 medicine: Losartan',
    ]);
    const tomorrow = phone.notifier.scheduled.get(
      doseNotificationId({ medication_id: losartanMorning.medication_id, due_at: `${TOMORROW} 08:00:00` }),
    )!;
    expect(tomorrow.at).toEqual(parseHubTime(`${TOMORROW} 08:00:00`));
  });

  test('dosesDueOn follows the hub rules: weekdays, start and end dates, inactive', () => {
    const due = (date: string, meds = medications) => dosesDueOn(meds, date).map((d) => `${d.due_at.slice(11, 16)} ${d.name}`);

    expect(due(TODAY)).toEqual(['06:30 Metformin', '08:00 Amlodipine', '08:00 Losartan', '20:00 Losartan']);
    expect(due(TOMORROW)).toEqual(['08:00 Amlodipine', '08:00 Losartan', '20:00 Losartan']);

    const [first, ...rest] = medications;
    expect(due(TODAY, [{ ...first, is_active: 0 }, ...rest])).not.toContain('08:00 Amlodipine');
    expect(due(TODAY, [{ ...first, start_date: TOMORROW }, ...rest])).not.toContain('08:00 Amlodipine');
    expect(due(TOMORROW, [{ ...first, start_date: TOMORROW }, ...rest])).toContain('08:00 Amlodipine');
    expect(due(TOMORROW, [{ ...first, end_date: TODAY }, ...rest])).not.toContain('08:00 Amlodipine');
    expect(due(TODAY, [{ ...first, end_date: TODAY }, ...rest])).toContain('08:00 Amlodipine');
  });

  test("the phone's doses for a day match the logs the hub creates for it", async () => {
    const phone = makePhone();
    const logs = (await phone.hub.getDosesToday()).filter((d) => d.id !== 'medlog-unconfirmed-1'); // seeded by hand, not from a time
    expect(dosesDueOn(medications, TODAY).map((d) => [d.medication_id, d.due_at])).toEqual(
      logs.map((d) => [d.medication_id, d.due_at]),
    );
  });

  test('refreshing again does not duplicate anything', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    await phone.reminders.refresh();
    await phone.reminders.refresh();
    expect(phone.notifier.scheduled.size).toBe(9);
  });

  test('a moved or removed item replaces its old notification', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();

    const moved = phone.hub.schedule[TODAY].find((o) => o.id === lunch.id)!;
    moved.occurrence_at = `${TODAY} 12:30:00`;
    moved.remind_at = `${TODAY} 12:00:00`;
    phone.hub.schedule[TODAY] = phone.hub.schedule[TODAY].filter((o) => o.id !== anaVisit.id);
    await phone.reminders.refresh();

    const summary = phone.notifier.summary();
    expect(summary).toContain('12:00 Lunch');
    expect(summary).not.toContain('11:30 Lunch');
    expect(summary).not.toContain('14:30 Ana visits');
    expect(phone.notifier.scheduled.size).toBe(8);
  });

  test("a refresh leaves other modules' notifications alone", async () => {
    const phone = makePhone();
    await phone.notifier.schedule({
      id: 'trivia:1',
      title: 'Trivia',
      body: '',
      at: parseHubTime(`${TODAY} 12:00:00`),
      data: {},
    });
    await phone.reminders.refresh();
    expect(phone.notifier.scheduled.has('trivia:1')).toBe(true);
  });

  test('items the patient or caregiver already answered get no reminder', async () => {
    const phone = makePhone();
    const answer = (id: string, response: 'acknowledged' | 'dismissed') => {
      const o = phone.hub.schedule[TODAY].find((x) => x.id === id)!;
      o.ack = { id: 'a', schedule_item_id: id, occurrence_at: o.occurrence_at, response, responded_at: `${TODAY} 06:50:00` };
    };
    answer(lunch.id, 'acknowledged');
    answer(anaVisit.id, 'dismissed');
    phone.hub.logs.find((d) => d.id === losartanMorning.id)!.status = 'taken';
    phone.hub.logs.find((d) => d.id === losartanEvening.id)!.status = 'skipped';
    await phone.reminders.refresh();

    expect(phone.notifier.summary()).toEqual([
      '07:15 Morning walk',
      '08:00 medicine: Amlodipine',
      '13:00 Afternoon nap',
      '17:30 Dinner',
      '06:30 Breakfast',
    ]);
  });

  test('buildPlan is ordered by time', () => {
    const plan = buildPlan({
      occurrences: [anaVisit, walk],
      doses: [losartanMorning],
      pending: [],
      snoozes: {},
      now: parseHubTime(`${TODAY} 07:00:00`),
    });
    expect(plan.map((n) => n.title)).toEqual(['Morning walk', 'Time for your medicine', 'Ana visits']);
  });
});

describe('with the hub off', () => {
  test('a reminder scheduled earlier still fires', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.hub.online = false;

    phone.clock.set(`${TODAY} 11:30:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toEqual([
      'Morning walk',
      'medicine: Amlodipine',
      'medicine: Losartan',
      'Lunch',
    ]);
  });

  test('a refresh that cannot reach the hub keeps what is scheduled', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.hub.online = false;

    const result = await phone.reminders.refresh();
    expect(result).toEqual({ reachable: false, scheduled: 0 });
    expect(phone.notifier.scheduled.size).toBe(9);
  });

  test('a first launch with no hub schedules nothing and does not throw', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await expect(phone.reminders.refresh()).resolves.toEqual({ reachable: false, scheduled: 0 });
    expect(phone.notifier.scheduled.size).toBe(0);
  });
});

describe('refresh timing', () => {
  afterEach(() => jest.useRealTimers());

  test('refreshes on app open and every 30 minutes until stopped', async () => {
    jest.useFakeTimers();
    const phone = makePhone();
    const refreshes = jest.spyOn(phone.hub, 'getDosesToday');

    const stop = phone.reminders.start();
    await jest.advanceTimersByTimeAsync(0);
    expect(refreshes).toHaveBeenCalledTimes(1);

    await jest.advanceTimersByTimeAsync(REFRESH_MS - 1);
    expect(refreshes).toHaveBeenCalledTimes(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(refreshes).toHaveBeenCalledTimes(2);
    await jest.advanceTimersByTimeAsync(REFRESH_MS);
    expect(refreshes).toHaveBeenCalledTimes(3);

    stop();
    await jest.advanceTimersByTimeAsync(REFRESH_MS * 2);
    expect(refreshes).toHaveBeenCalledTimes(3);
  });
});

describe('banner', () => {
  test('shows a reminder from its remind time until the item ends', async () => {
    const phone = makePhone({ start: `${TODAY} 06:00:00` });
    await phone.reminders.refresh();
    const titles = async () => (await phone.reminders.due()).reminders.map((o) => o.title);

    expect(await titles()).toEqual([]);
    phone.clock.set(`${TODAY} 06:30:00`);
    expect(await titles()).toEqual(['Breakfast']);
    phone.clock.set(`${TODAY} 07:29:00`);
    expect(await titles()).toEqual(['Breakfast', 'Morning walk']);
    phone.clock.set(`${TODAY} 07:30:00`);
    expect(await titles()).toEqual(['Morning walk']);
  });

  test('an item with no duration shows for 15 minutes after its start', async () => {
    const phone = makePhone();
    const visit = phone.hub.schedule[TODAY].find((o) => o.id === anaVisit.id)!;
    visit.duration_min = null;
    visit.ends_at = null;
    await phone.reminders.refresh();
    const titles = async () => (await phone.reminders.due()).reminders.map((o) => o.title);

    phone.clock.set(`${TODAY} 15:14:00`);
    expect(await titles()).toEqual(['Ana visits']);
    phone.clock.set(`${TODAY} 15:15:00`);
    expect(await titles()).toEqual([]);
  });

  test('Okay posts acknowledged and the reminder does not come back', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 11:35:00`);
    phone.notifier.deliver(phone.clock.now());

    await phone.reminders.okay(lunch);
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`ack ${lunch.id} acknowledged`]);
    expect(phone.hub.schedule[TODAY].find((o) => o.id === lunch.id)!.ack?.response).toBe('acknowledged');
    // Before the next refresh the cached schedule still says unanswered; the banner must not return.
    expect((await phone.reminders.due()).reminders).toEqual([]);
    await phone.reminders.refresh();
    expect((await phone.reminders.due()).reminders).toEqual([]);
    // Tomorrow's lunch is in the window by now; today's must not be rescheduled.
    expect(phone.notifier.scheduled.has(scheduleNotificationId(lunch))).toBe(false);
  });

  test('Later posts snoozed and reminds again 10 minutes later', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 11:32:00`);
    phone.notifier.deliver(phone.clock.now());

    await phone.reminders.later(lunch);
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`ack ${lunch.id} snoozed`]);
    expect(phone.notifier.summary()).toContain('11:42 Lunch');
    expect((await phone.reminders.due()).reminders).toEqual([]);

    phone.clock.set(`${TODAY} 11:42:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toEqual(['Lunch']);
    expect((await phone.reminders.due()).reminders.map((o) => o.title)).toEqual(['Lunch']);
  });

  test('a snooze survives a refresh', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 11:32:00`);
    phone.notifier.deliver(phone.clock.now());
    await phone.reminders.later(lunch);

    await phone.reminders.refresh();
    expect(phone.notifier.scheduled.get(scheduleNotificationId(lunch))?.at).toEqual(parseHubTime(`${TODAY} 11:42:00`));
    // Today's snoozed lunch and tomorrow's lunch, nothing doubled.
    expect(phone.notifier.summary().filter((line) => line.includes('Lunch'))).toEqual(['11:42 Lunch', '11:30 Lunch']);
  });

  test('Later close to the start reminds at the start, and after the start not at all', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();

    phone.clock.set(`${TODAY} 11:55:00`);
    phone.notifier.deliver(phone.clock.now());
    await phone.reminders.later(lunch);
    expect(phone.notifier.summary()).toContain('12:00 Lunch');

    phone.clock.set(`${TODAY} 12:00:00`);
    phone.notifier.deliver(phone.clock.now());
    await phone.reminders.later(lunch);
    expect(phone.notifier.summary().filter((line) => line.includes('Lunch'))).toEqual([]);
    expect((await phone.reminders.due()).reminders).toEqual([]);

    await phone.queue.flush();
    expect(phone.hub.received).toEqual([`ack ${lunch.id} snoozed`, `ack ${lunch.id} snoozed`]);
  });

  test('Later then Okay cancels the snoozed reminder', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 11:32:00`);
    phone.notifier.deliver(phone.clock.now());

    await phone.reminders.later(lunch);
    await phone.reminders.okay(lunch);
    await phone.queue.flush();

    expect(phone.notifier.summary().filter((line) => line.includes('Lunch'))).toEqual([]);
    expect(phone.hub.schedule[TODAY].find((o) => o.id === lunch.id)!.ack?.response).toBe('acknowledged');
  });
});

describe('medication hand-off', () => {
  const names = async (phone: ReturnType<typeof makePhone>) =>
    (await phone.reminders.due()).doses.map((d) => `${d.name} ${d.due_at.slice(11, 16)}`);

  test('due() lists doses whose time has come and are unconfirmed', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();

    // The 00:19 Amlodipine row is the hub's own demo seed (an overdue dose).
    expect(await names(phone)).toEqual(['Amlodipine 00:19', 'Metformin 06:30']);
    phone.clock.set(`${TODAY} 08:00:00`);
    expect(await names(phone)).toEqual(['Amlodipine 00:19', 'Metformin 06:30', 'Amlodipine 08:00', 'Losartan 08:00']);
  });

  test('confirmDose posts the status the patient tapped and nothing else', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 08:00:00`);

    await phone.reminders.confirmDose(losartanMorning, 'taken');
    await phone.reminders.confirmDose(metforminMorning, 'skipped');
    await phone.queue.flush();

    expect(phone.hub.received).toEqual([`dose ${losartanMorning.id} taken`, `dose ${metforminMorning.id} skipped`]);
    const status = (id: string) => phone.hub.logs.find((d) => d.id === id)!;
    expect(status(losartanMorning.id)).toMatchObject({ status: 'taken', confirmed_by: 'patient' });
    expect(status(metforminMorning.id)).toMatchObject({ status: 'skipped', confirmed_by: 'patient' });
    expect(status(amlodipineMorning.id).status).toBe('unconfirmed');
    expect(await names(phone)).toEqual(['Amlodipine 00:19', 'Amlodipine 08:00']);
  });

  test('confirming early cancels that dose reminder only', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();

    await phone.reminders.confirmDose(losartanMorning, 'taken');
    expect(phone.notifier.scheduled.has(doseNotificationId(losartanMorning))).toBe(false);
    expect(phone.notifier.scheduled.has(doseNotificationId(amlodipineMorning))).toBe(true);
    expect(phone.notifier.scheduled.has(doseNotificationId(losartanEvening))).toBe(true);
  });

  test('a reminder firing never marks a dose', async () => {
    const phone = makePhone();
    await phone.reminders.refresh();
    phone.clock.set(`${TODAY} 21:00:00`);
    phone.notifier.deliver(phone.clock.now());
    await phone.reminders.refresh();

    expect(phone.hub.received).toEqual([]);
    expect(phone.hub.logs.every((d) => d.status === 'unconfirmed')).toBe(true);
  });

  test('hub off since yesterday: the morning dose still shows and its answer reaches the hub', async () => {
    const phone = makePhone({ start: `${TODAY} 19:00:00` });
    await phone.reminders.refresh();
    phone.hub.online = false;
    phone.restart();

    // Next morning. The phone never saw today's logs, so the dose has no log id yet.
    phone.clock.set(`${TOMORROW} 08:00:00`);
    expect(phone.notifier.deliver(phone.clock.now())).toContain('medicine: Losartan');
    const due = (await phone.reminders.due()).doses;
    expect(due.map((d) => [d.name, d.id])).toEqual([
      ['Amlodipine', null],
      ['Losartan', null],
    ]);

    await phone.reminders.confirmDose(due[1], 'taken');
    await phone.queue.flush();
    expect(phone.hub.received).toEqual([]);
    expect((await phone.reminders.due()).doses.map((d) => d.name)).toEqual(['Amlodipine']);

    // The hub returns the same day; the log it created for that dose is found and updated.
    phone.hub.online = true;
    await phone.reminders.refresh();
    const log = phone.hub.logs.find((d) => d.due_at === `${TOMORROW} 08:00:00` && d.name === 'Losartan')!;
    expect(log).toMatchObject({ status: 'taken', confirmed_by: 'patient' });
    expect(phone.hub.received).toEqual([`dose ${log.id} taken`]);
    expect((await phone.reminders.due()).doses.map((d) => d.name)).toEqual(['Amlodipine']);
  });

  test('a dose answered offline that the hub no longer lists is dropped, not retried forever', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.queue.enqueue({ type: 'dose', logId: null, medicationId: 'gone', dueAt: `${TODAY} 08:00:00`, status: 'taken' });
    phone.hub.online = true;
    await phone.queue.flush();
    expect(await phone.queue.pending()).toEqual([]);
    expect(phone.hub.received).toEqual([]);
  });
});
