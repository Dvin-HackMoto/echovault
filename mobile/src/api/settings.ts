// EchoVault mobile — settings + patient profile API.
//
// Typed against the REAL backend (backend/app/features/settings/router.py):
//   GET  /settings  -> parsed SettingsValues (all four keys, defaults filled)
//   PUT  /settings  -> validates + upserts the provided keys, returns the full set
//   GET  /patient   -> the single patient row, or {} if not created yet
//   PUT  /patient   -> upserts patient id=1, returns the row

import { get, put } from "./client";
import type { Patient, SettingsValues } from "../types";

/** Read all settings (missing keys fall back to the hub defaults). */
export function getSettings(): Promise<SettingsValues> {
  return get<SettingsValues>("/settings");
}

/**
 * Update one or more settings keys. Only the provided keys are changed; the
 * hub returns the full, re-read settings object. Caregiver only.
 */
export function updateSettings(partial: Partial<SettingsValues>): Promise<SettingsValues> {
  return put<SettingsValues>("/settings", partial);
}

/**
 * Read the patient profile. Returns `{}` (not 404) before the profile exists,
 * so the patient app can read font scale / voice / managed mode at any time.
 */
export function getPatient(): Promise<Patient | Record<string, never>> {
  return get<Patient | Record<string, never>>("/patient");
}

/** Fields the backend accepts on PUT /patient (id is fixed to 1 server-side). */
export type PatientUpdate = Partial<Omit<Patient, "id" | "updated_at">>;

/** Upsert the patient profile (id=1). full_name is required on first create. */
export function updatePatient(partial: PatientUpdate): Promise<Patient> {
  return put<Patient>("/patient", partial);
}
