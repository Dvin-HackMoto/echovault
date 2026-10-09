// EchoVault mobile — medications API.
// Wired to the ARCHITECTURE-named routes (CRUD + log status) pending the
// backend Medications module. All calls go through the shared client.

import { del, get, post, put } from "./client";
import type {
  ConfirmedBy,
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

/** Today's due logs (generated unconfirmed by the hub). GET /medications/logs/today. */
export function todayMedicationLogs(): Promise<MedicationLog[]> {
  return get<MedicationLog[]>("/medications/logs/today");
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
  return post<MedicationLog>(`/medications/logs/${logId}`, {
    status,
    confirmed_by: confirmedBy,
  });
}
