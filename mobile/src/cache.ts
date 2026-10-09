// EchoVault mobile — offline cache (ARCHITECTURE §11).
// Stores the last-fetched schedule and people in AsyncStorage so the patient
// home still shows something when the hub is unreachable. Foundation-level:
// typed get/set with JSON serialization, no sync queue yet.

import AsyncStorage from "@react-native-async-storage/async-storage";

import type { Person, ScheduleItem } from "./types";

const KEY_SCHEDULE = "ev.cache.schedule";
const KEY_PEOPLE = "ev.cache.people";

/** Read a JSON value, returning null on absence or parse failure. */
async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

/** Write a JSON value. */
async function writeJson(key: string, value: unknown): Promise<void> {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export function cacheSchedule(items: ScheduleItem[]): Promise<void> {
  return writeJson(KEY_SCHEDULE, items);
}

export function getCachedSchedule(): Promise<ScheduleItem[] | null> {
  return readJson<ScheduleItem[]>(KEY_SCHEDULE);
}

export function cachePeople(people: Person[]): Promise<void> {
  return writeJson(KEY_PEOPLE, people);
}

export function getCachedPeople(): Promise<Person[] | null> {
  return readJson<Person[]>(KEY_PEOPLE);
}

/** Clear all cached data (e.g. on hub change). */
export async function clearCache(): Promise<void> {
  await AsyncStorage.multiRemove([KEY_SCHEDULE, KEY_PEOPLE]);
}
