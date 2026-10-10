// EchoVault mobile — read-through cache for patient screens (ARCHITECTURE §11).
//
// withCache() fetches and saves the result. If the hub can't be reached it
// returns the last saved copy instead, marked fromCache so the screen can say
// the information may not be current. Other errors are not hidden. Kept apart
// from src/cache.ts, which Module 15 (reminders and offline) owns.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError } from "../api/client";

export interface Cached<T> {
  data: T;
  fromCache: boolean;
  savedAt: number | null; // when the saved copy was fetched (ms)
}

const PREFIX = "ev.patient.cache.";

export function isUnreachable(error: unknown): boolean {
  return error instanceof ApiError && (error.kind === "network" || error.kind === "timeout");
}

export async function withCache<T>(key: string, fetcher: () => Promise<T>): Promise<Cached<T>> {
  try {
    const data = await fetcher();
    AsyncStorage.setItem(PREFIX + key, JSON.stringify({ data, savedAt: Date.now() })).catch(() => {});
    return { data, fromCache: false, savedAt: Date.now() };
  } catch (error) {
    if (!isUnreachable(error)) throw error;
    const saved = await AsyncStorage.getItem(PREFIX + key).catch(() => null);
    if (!saved) throw error;
    const { data, savedAt } = JSON.parse(saved) as { data: T; savedAt: number };
    return { data, fromCache: true, savedAt };
  }
}

/** The message for a failed hub call, in words the patient understands. */
export function hubMessage(error: unknown): string {
  if (isUnreachable(error)) return "Can't reach the helper right now.";
  if (error instanceof ApiError && error.kind === "config") return "The hub is not set up on this phone yet.";
  return "Something went wrong. Please try again.";
}
