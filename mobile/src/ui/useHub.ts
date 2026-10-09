// EchoVault mobile — load hub data for a screen.
//
// Fetches when the screen comes into focus (so a change made on the caregiver
// phone shows up on the next visit), and on pull-to-refresh. With a cache key the
// last good copy is shown when the hub can't be reached, marked fromCache.

import { useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";

import { ApiError } from "../api/client";
import { hubMessage, withCache } from "../patient/cached";

export interface HubData<T> {
  data: T | null;
  /** The saved copy is shown because the hub can't be reached. */
  fromCache: boolean;
  savedAt: number | null;
  /** A message for the screen when nothing could be loaded. */
  error: string | null;
  /** The route's module is not merged into the hub yet. */
  notBuilt: boolean;
  loading: boolean;
  reload: () => Promise<void>;
}

export function useHub<T>(fetcher: () => Promise<T>, cacheKey?: string): HubData<T> {
  const [data, setData] = useState<T | null>(null);
  const [fromCache, setFromCache] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notBuilt, setNotBuilt] = useState(false);
  const [loading, setLoading] = useState(true);
  // the latest fetcher, without making reload change on every render
  const fetchRef = useRef(fetcher);
  fetchRef.current = fetcher;

  const reload = useCallback(async () => {
    try {
      if (cacheKey) {
        const result = await withCache(cacheKey, () => fetchRef.current());
        setData(result.data);
        setFromCache(result.fromCache);
        setSavedAt(result.savedAt);
      } else {
        setData(await fetchRef.current());
        setFromCache(false);
      }
      setError(null);
      setNotBuilt(false);
    } catch (e) {
      setError(hubMessage(e));
      setNotBuilt(e instanceof ApiError && e.kind === "not_built");
    } finally {
      setLoading(false);
    }
  }, [cacheKey]);

  useFocusEffect(
    useCallback(() => {
      void reload();
    }, [reload]),
  );

  return { data, fromCache, savedAt, error, notBuilt, loading, reload };
}

/** A short message for a failed save, for toasts. */
export function saveError(e: unknown): string {
  if (e instanceof ApiError && e.kind === "not_built") return "This part isn't on the hub yet. It will work once its module is merged.";
  if (e instanceof ApiError && e.kind === "http" && e.status === 403) return "Your caregiver access doesn't allow this.";
  if (e instanceof ApiError && e.kind === "http" && e.status && e.status < 500) return e.message;
  return hubMessage(e);
}
