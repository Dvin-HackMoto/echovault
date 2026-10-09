// EchoVault mobile — medications API.
// Wired to the ARCHITECTURE-named routes (CRUD + log status) pending the
// backend Medications module. All calls go through the shared client.

import { del, get, post, put } from "./client";
import type {
  ConfirmedBy,
  Dose,
  MedStatus,
  Medication,
  MedicationLog,
  MedicationTime,
} from "../types";

export type MedicationInput = Partial<Omit<Medication, "id" | "updated_at">>;

/** A medication with its dosing times, as the detail view needs. */
export interface MedicationWithTimes extends Medication {
  times: MedicationTime[];
}

export function listMedications(): Promise<Medication[]> {
  return get<Medication[]>("/medications");
}

export function getMedication(id: string): Promise<MedicationWithTimes> {
  return get<MedicationWithTimes>(`/medications/${id}`);
}

export function createMedication(input: MedicationInput): Promise<Medication> {
  return post<Medication>("/medications", input);
}

export function updateMedication(id: string, input: MedicationInput): Promise<Medication> {
  return put<Medication>(`/medications/${id}`, input);
}

export function deleteMedication(id: string): Promise<void> {
  return del<void>(`/medications/${id}`);
}

/**
 * Today's doses: the logs the hub generates (unconfirmed) joined to their
 * medicine name, dose, instructions and photo. GET /medications/today.
 */
export function todayMedicationLogs(): Promise<Dose[]> {
  return get<Dose[]>("/medications/today");
}

/**
 * Set a dose's status. POST /medications/logs/{id}.
 * `confirmed_by` separates "patient tapped it" from "caregiver confirmed it".
 */
export function logMedicationStatus(
  logId: string,
  status: MedStatus,
  confirmedBy: ConfirmedBy,
): Promise<MedicationLog> {
  return post<MedicationLog>(`/medications/logs/${encodeURIComponent(logId)}`, {
    status,
    confirmed_by: confirmedBy,
  });
}
