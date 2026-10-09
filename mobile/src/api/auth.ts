// EchoVault mobile — auth API.
//
// Typed against the documented contract: POST /auth/pin (caregiver PIN login)
// and GET /auth/me. The backend auth router is still a stub, so these are
// wired to the ARCHITECTURE contract pending the Auth module.

import { get, post } from "./client";
import type { AccessLevel, Caregiver } from "../types";

/** Shape the hub returns after a successful PIN login. */
export interface PinLoginResult {
  id: string;
  access_level: AccessLevel;
}

/**
 * Log a caregiver in with their PIN. On success the caller should persist the
 * returned id via `setCaregiverId()` so later requests carry X-Caregiver-Id.
 */
export function pinLogin(pin: string): Promise<PinLoginResult> {
  return post<PinLoginResult>("/auth/pin", { pin });
}

/** Return the current caregiver (resolved from X-Caregiver-Id), or null. */
export function me(): Promise<Caregiver | null> {
  return get<Caregiver | null>("/auth/me");
}
