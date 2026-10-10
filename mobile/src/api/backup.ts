// EchoVault mobile — backup / restore API.
//
// Typed against the REAL backend (backend/app/features/backup/router.py):
//   GET  /backup/export -> a downloadable zip (echovault.db + photos/)
//   POST /backup/import -> multipart form: `file` = zip, `confirm` = "true"
//
// Export returns a binary zip, not JSON, so the caregiver backup screen streams
// it to disk with expo-file-system instead of going through request().

import { postForm, resolveUrl, roleHeaders } from "./client";
import type { UploadFile } from "./client";

/**
 * Where and how to download the export: the absolute URL, plus the X-Role /
 * X-Caregiver-Id headers the hub requires (export is caregiver only). A screen
 * hands both to expo-file-system's downloadAsync so the zip is streamed to disk
 * rather than buffered in memory. Throws a config ApiError if no hub is set.
 */
export async function exportBackupRequest(): Promise<{ url: string; headers: Record<string, string> }> {
  return { url: await resolveUrl("/backup/export"), headers: await roleHeaders() };
}

/** Result the hub returns after a successful import. */
export interface ImportResult {
  status: string;
  detail: string;
}

/**
 * Restore the hub from a backup bundle. Admin only. `confirm` must be the
 * string "true" — the backend rejects anything else with a 400. Pass the
 * picked zip as an {uri,name,type} file part.
 */
export function importBackup(file: UploadFile, confirm = true): Promise<ImportResult> {
  const form = new FormData();
  form.append("file", file as unknown as Blob);
  form.append("confirm", confirm ? "true" : "false");
  return postForm<ImportResult>("/backup/import", form);
}
