// EchoVault mobile — medications API (backend/app/features/medications/router.py):
// CRUD with dosing times, photo upload, today's doses and dose confirmation.
// All calls go through the shared client.

import { del, get, post, put, uploadFile, type UploadFile } from "./client";
import type {
  ConfirmedBy,
  Dose,
  MedStatus,
  Medication,
  MedicationLog,
  MedicationTime,
} from "../types";

/**
 * What a caregiver writes on create/update. `times` replaces the medicine's
 * dosing times (the hub has no separate times endpoint). The photo is not part
 * of it: it only changes through uploadMedicationPhoto.
 */
export type MedicationInput = Partial<Omit<Medication, "id" | "updated_at" | "photo_path">> & {
  times?: { time_of_day: string; days?: string }[];
};

/** A medication with its dosing times and photo URL, as GET /medications returns it. */
export interface MedicationWithTimes extends Medication {
  times: MedicationTime[];
  photo_url?: string | null;
}

export function listMedications(): Promise<MedicationWithTimes[]> {
  return get<MedicationWithTimes[]>("/medications");
}

/** Upload the pill or box photo (multipart field `photo`; JPEG, PNG or WebP). POST /medications/{id}/photo. */
export function uploadMedicationPhoto(id: string, file: UploadFile): Promise<MedicationWithTimes> {
  return uploadFile<MedicationWithTimes>(`/medications/${encodeURIComponent(id)}/photo`, "photo", file);
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
 * The hub records who answered from the request's role headers (patient or
 * caregiver); `confirmed_by` is sent for readability and ignored by the hub.
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
