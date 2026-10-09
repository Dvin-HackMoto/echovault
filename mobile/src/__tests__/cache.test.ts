// REM-2 Offline cache

import { HubRejected, HubUnreachable } from '../hub';
import { makePhone } from '../testing/fakes';
import { TODAY, TOMORROW, metforminMorning } from '../testing/fixtures';

describe('serving from the cache', () => {
  test('home, schedule and people data come from the cache with the hub off', async () => {
    const phone = makePhone();
    const online = {
      profile: await phone.cache.profile(),
      schedule: await phone.cache.schedule(),
      doses: await phone.cache.doses(),
      people: await phone.cache.people(),
    };
    phone.hub.online = false;
    phone.restart();

    expect((await phone.cache.profile()).data).toEqual(online.profile.data);
    expect((await phone.cache.schedule()).data).toEqual(online.schedule.data);
    expect((await phone.cache.doses()).data).toEqual(online.doses.data);
    expect((await phone.cache.people()).data).toEqual(online.people.data);
    expect((await phone.cache.profile()).data?.preferred_name).toBe('Lola Nena');
    expect((await phone.cache.schedule()).data.map((o) => o.title)).toEqual([
      'Breakfast',
      'Morning walk',
      'Lunch',
      'Afternoon nap',
      'Ana visits',
      'Dinner',
    ]);
  });

  test('cached data is marked as possibly not current, with when it was saved', async () => {
    const phone = makePhone();
    const fresh = await phone.cache.schedule();
    expect(fresh.stale).toBe(false);

    phone.hub.online = false;
    phone.clock.advanceMinutes(90);
    const cached = await phone.cache.schedule();
    expect(cached.stale).toBe(true);
    expect(cached.cachedAt).toBe(fresh.cachedAt);
    expect(new Date(cached.cachedAt).getTime()).toBe(phone.clock.now().getTime() - 90 * 60_000);
  });

  test('the cache refreshes on every successful fetch', async () => {
    const phone = makePhone();
    await phone.cache.people();
    await phone.cache.schedule();

    phone.hub.people[0].notes = 'Visits every Sunday now.';
    phone.hub.schedule[TODAY] = phone.hub.schedule[TODAY].slice(0, 1);
    phone.clock.advanceMinutes(30);
    const second = await phone.cache.people();
    await phone.cache.schedule();

    phone.hub.online = false;
    const people = await phone.cache.people();
    expect(people.data[0].notes).toBe('Visits every Sunday now.');
    expect(people.cachedAt).toBe(second.cachedAt);
    expect((await phone.cache.schedule()).data.map((o) => o.title)).toEqual(['Breakfast']);
  });

  test('a hub with no patient profile yet is cached as none, not as an error', async () => {
    const phone = makePhone();
    phone.hub.profile = null;
    expect((await phone.cache.profile()).data).toBeNull();
    phone.hub.online = false;
    expect(await phone.cache.profile()).toMatchObject({ data: null, stale: true });
  });

  test('with nothing cached and no hub, the caller is told the hub is unreachable', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await expect(phone.cache.people()).rejects.toBeInstanceOf(HubUnreachable);
  });

  test('a hub error that is not about reachability is not hidden by the cache', async () => {
    const phone = makePhone();
    await phone.cache.people();
    jest.spyOn(phone.hub, 'getPeople').mockRejectedValue(new HubRejected(403));
    await expect(phone.cache.people()).rejects.toBeInstanceOf(HubRejected);
  });

  test('schedule and doses are cached per day, and past days are dropped', async () => {
    const phone = makePhone();
    await phone.cache.schedule(TODAY);
    await phone.cache.schedule(TOMORROW);
    await phone.cache.doses();

    phone.clock.set(`${TOMORROW} 07:00:00`);
    await phone.cache.doses();

    const keys = [...phone.store.data.keys()].filter((k) => k.startsWith('cache:')).sort();
    expect(keys).toEqual([`cache:doses:${TOMORROW}`, `cache:schedule:${TOMORROW}`]);

    phone.hub.online = false;
    expect((await phone.cache.schedule()).data.map((o) => o.title)).toContain('Sunday Mass');
    expect((await phone.cache.doses()).data.every((d) => d.due_at.startsWith(TOMORROW))).toBe(true);
  });

  test('a successful fetch sends anything waiting in the queue', async () => {
    const phone = makePhone();
    phone.hub.online = false;
    await phone.reminders.confirmDose(metforminMorning, 'taken');

    phone.hub.online = true;
    await phone.cache.profile();
    await phone.queue.flush();
    expect(phone.hub.received).toEqual([`dose ${metforminMorning.id} taken`]);
  });
});

describe('photos', () => {
  test('photos are saved to the phone and shown from there offline', async () => {
    const phone = makePhone();
    const online = await phone.cache.people();
    expect(phone.files.downloads).toEqual([
      'http://192.168.1.10:8000/photos/ana.jpg',
      'http://192.168.1.10:8000/photos/miguel.jpg',
    ]);
    expect(online.data.map((p) => p.photo_uri)).toEqual([
      'file:///photos/p-ana-ana.jpg',
      'file:///photos/p-miguel-miguel.jpg',
      null,
    ]);

    phone.hub.online = false;
    const offline = await phone.cache.people();
    expect(offline.data.map((p) => p.photo_uri)).toEqual(online.data.map((p) => p.photo_uri));
  });

  test('a photo already on the phone is not downloaded again', async () => {
    const phone = makePhone();
    await phone.cache.people();
    await phone.cache.people();
    expect(phone.files.downloads).toHaveLength(2);
  });

  test('a replaced photo is downloaded and the old file removed', async () => {
    const phone = makePhone();
    await phone.cache.people();
    phone.hub.people[0].photo_path = 'ana-2026.jpg';
    phone.hub.people = phone.hub.people.filter((p) => p.id !== 'p-miguel');

    const people = await phone.cache.people();
    expect(people.data[0].photo_uri).toBe('file:///photos/p-ana-ana-2026.jpg');
    expect([...phone.files.saved.keys()]).toEqual(['p-ana-ana-2026.jpg']);
  });

  test('a failed photo download does not fail the fetch', async () => {
    const phone = makePhone();
    phone.files.failing = true;
    const first = await phone.cache.people();
    expect(first.stale).toBe(false);
    expect(first.data[0].photo_uri).toBe('http://192.168.1.10:8000/photos/ana.jpg');

    phone.files.failing = false;
    const second = await phone.cache.people();
    expect(second.data[0].photo_uri).toBe('file:///photos/p-ana-ana.jpg');
  });
});
