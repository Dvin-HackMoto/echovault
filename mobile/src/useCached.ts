// hook for screens that should still render when the hub is unreachable
//
//   const people = useCached(() => offline.cache.people());
//   <StaleNotice from={people.result} />
//   {people.result?.data.map(...)}

import { useCallback, useEffect, useState } from 'react';

import { Cached } from './cache';
import { HubUnreachable } from './hub';

export function useCached<T>(read: () => Promise<Cached<T>>) {
  const [result, setResult] = useState<Cached<T> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      setResult(await read());
      setError(null);
    } catch (caught) {
      setError(caught);
    } finally {
      setLoading(false);
    }
    // `read` is a new function on every render; the screen decides when to reload.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  // `unavailable`: the hub is unreachable and nothing has ever been cached for this screen.
  return { result, loading, error, unavailable: error instanceof HubUnreachable, reload };
}
