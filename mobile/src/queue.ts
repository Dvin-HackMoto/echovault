// patient actions waiting for the hub, kept in AsyncStorage

import { AckResponse, DoseStatus, HubApi, HubRejected, KeyValueStore } from './hub';

const KEY = 'queue:actions';

// A dose is identified by medication and time. logId is null when the phone had not
// seen the hub's log for it yet (answered offline on a later day); it is looked up on send.
export type NewAction =
  | { type: 'ack'; itemId: string; occurrenceAt: string; response: AckResponse }
  | { type: 'dose'; logId: string | null; medicationId: string; dueAt: string; status: DoseStatus };

export type QueuedAction = { id: string; queuedAt: string } & NewAction;

export type Queue = ReturnType<typeof createQueue>;

export function createQueue(deps: { hub: HubApi; store: KeyValueStore; now?: () => Date }) {
  const { hub, store } = deps;
  const now = deps.now ?? (() => new Date());

  // Every read-modify-write of the stored list goes through this chain, so an
  // enqueue during a flush cannot overwrite the flush's removal (or the reverse).
  let chain: Promise<unknown> = Promise.resolve();
  function locked<T>(work: () => Promise<T>): Promise<T> {
    const run = chain.then(work, work);
    chain = run.catch(() => undefined);
    return run;
  }

  async function load(): Promise<QueuedAction[]> {
    const raw = await store.getItem(KEY);
    return raw ? JSON.parse(raw) : [];
  }

  const save = (actions: QueuedAction[]) => store.setItem(KEY, JSON.stringify(actions));

  async function send(action: QueuedAction): Promise<void> {
    if (action.type === 'ack') {
      return hub.postAck(action.itemId, action.occurrenceAt, action.response);
    }
    let logId = action.logId;
    if (!logId) {
      const today = await hub.getDosesToday();
      logId = today.find((d) => d.medication_id === action.medicationId && d.due_at === action.dueAt)?.id ?? null;
      // The hub only lists today's logs to the patient; an older dose can no longer be recorded from here.
      if (!logId) throw new HubRejected(404, 'The hub has no dose for this medicine and time today');
    }
    return hub.postDose(logId, action.status);
  }

  let flushing: Promise<void> = Promise.resolve();

  async function drain(): Promise<void> {
    for (;;) {
      const [head] = await locked(load);
      if (!head) return;
      try {
        await send(head);
      } catch (error) {
        // Unreachable: keep it at the front and stop, so the order holds for the next try.
        if (!(error instanceof HubRejected)) return;
        // Rejected: the hub will never take it; drop it so it cannot block the rest.
      }
      await locked(async () => save((await load()).filter((a) => a.id !== head.id)));
    }
  }

  return {
    pending: () => locked(load),

    enqueue(action: NewAction): Promise<QueuedAction> {
      return locked(async () => {
        const actions = await load();
        const queued = {
          ...action,
          id: `${now().getTime()}-${Math.random().toString(36).slice(2, 10)}`,
          queuedAt: now().toISOString(),
        } as QueuedAction;
        await save([...actions, queued]);
        return queued;
      });
    },

    /** Sends queued actions oldest first. Never throws; whatever could not be sent stays queued. */
    flush(): Promise<void> {
      // One drain at a time; a flush asked for during another runs after it, so an
      // action enqueued while the first was finishing is still picked up.
      flushing = flushing.then(drain).catch(() => undefined);
      return flushing;
    },
  };
}
