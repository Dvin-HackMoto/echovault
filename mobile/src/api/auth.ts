// EchoVault mobile — auth API (Module 02, AUTH-2).
//
// POST /auth/pin (caregiver PIN login) and GET /auth/me, plus the session
// helpers the caregiver PIN screen (CGV-1) uses: a correct PIN saves the
// caregiver id and role so every later request carries X-Role: caregiver and
// X-Caregiver-Id; leaving caregiver mode clears them so the PIN is needed again.

import AsyncStorage from "@react-native-async-storage/async-storage";

import { ApiError, get, post, setCaregiverId, setRole } from "./client";
import type { AccessLevel } from "../types";

const KEY_ACCESS_LEVEL = "ev.accessLevel";

/** The caregiver the hub returns after a PIN login and from /auth/me. Never includes the PIN or its hash. */
export interface CaregiverIdentity {
  id: string;
  name: string;
  relationship?: string | null;
  access_level: AccessLevel;
}

export type PinLoginResult = CaregiverIdentity;

/**
 * Check a PIN. `caregiverId` is only needed when two caregivers share a PIN
 * (the hub then answers 409 with the names to choose from).
 * Errors (ApiError "http"): 401 wrong PIN or inactive caregiver, 409 shared
 * PIN, 429 too many wrong PINs (wait and try again).
 */
export function pinLogin(pin: string, caregiverId?: string): Promise<PinLoginResult> {
  return post<PinLoginResult>("/auth/pin", caregiverId ? { pin, caregiver_id: caregiverId } : { pin });
}

/** The current caregiver, resolved from X-Caregiver-Id. */
export function me(): Promise<CaregiverIdentity> {
  return get<CaregiverIdentity>("/auth/me");
}

/** Log in and switch the client to caregiver mode. */
export async function startCaregiverSession(pin: string, caregiverId?: string): Promise<CaregiverIdentity> {
  const caregiver = await pinLogin(pin, caregiverId);
  await setCaregiverId(caregiver.id);
  await setRole("caregiver");
  await AsyncStorage.setItem(KEY_ACCESS_LEVEL, caregiver.access_level);
  return caregiver;
}

/** Leave caregiver mode: forget the caregiver, so the PIN is needed again. */
export async function endCaregiverSession(): Promise<void> {
  await setCaregiverId(null);
  await setRole("patient");
  await AsyncStorage.removeItem(KEY_ACCESS_LEVEL);
}

/** The signed-in caregiver's access level, or null outside caregiver mode. */
export async function getAccessLevel(): Promise<AccessLevel | null> {
  const value = await AsyncStorage.getItem(KEY_ACCESS_LEVEL);
  return value === "admin" || value === "editor" || value === "viewer" ? value : null;
}

/**
 * Re-read the caregiver from the hub (an admin may have changed their access
 * level, or deactivated them). A 401 ends the session.
 */
export async function refreshCaregiverSession(): Promise<CaregiverIdentity | null> {
  try {
    const caregiver = await me();
    await AsyncStorage.setItem(KEY_ACCESS_LEVEL, caregiver.access_level);
    return caregiver;
  } catch (err) {
    if (err instanceof ApiError && err.kind === "http" && err.status === 401) {
      await endCaregiverSession();
      return null;
    }
    throw err;
  }
}

/** A short message for a failed PIN login, for the PIN screen. */
export function pinErrorMessage(err: unknown): string {
  if (err instanceof ApiError && err.kind === "http") {
    if (err.status === 401) return "Wrong PIN. Please try again.";
    if (err.status === 429) return err.message; // "Too many wrong PINs. Try again in N seconds."
    if (err.status === 409) return "This PIN belongs to more than one caregiver. Choose your name.";
  }
  if (err instanceof ApiError && (err.kind === "network" || err.kind === "timeout")) {
    return "Can't reach the hub right now.";
  }
  return "Something went wrong. Please try again.";
}

/** On a 409 (shared PIN): the caregivers to choose from, else null. */
export function sharedPinCaregivers(err: unknown): { id: string; name: string }[] | null {
  if (!(err instanceof ApiError) || err.status !== 409) return null;
  try {
    const detail = JSON.parse(err.message) as { detail?: { caregivers?: { id: string; name: string }[] } };
    return detail.detail?.caregivers ?? null;
  } catch {
    return null;
  }
}
