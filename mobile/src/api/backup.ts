// EchoVault mobile — backup / restore API.
//
// Typed against the REAL backend (backend/app/features/backup/router.py):
//   GET  /backup/export -> a downloadable zip (echovault.db + photos/)
//   POST /backup/import -> multipart form: `file` = zip, `confirm` = "true"
//
// Export returns a binary zip, not JSON. Actually saving the file to the phone
// (expo-file-system / share sheet) is a SCREEN concern deferred to Module 16;
// here we only expose the typed endpoint path + a header-only probe so a
// screen can trigger and then stream/download the bytes itself.

import { getHubUrl, postForm, ApiError } from "./client";
import type { UploadFile } from "./client";

/**
 * The absolute URL of the export endpoint, resolved from the saved hub base.
 * A screen hands this to expo-file-system's download so the zip is streamed to
 * disk rather than buffered in memory. Throws a config ApiError if no hub set.
 */
export async function exportBackupUrl(): Promise<string> {
  const base = await getHubUrl();
  if (!base) {
    throw new ApiError("config", "Hub address is not set yet.");
  }
  return `${base}/backup/export`;
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
