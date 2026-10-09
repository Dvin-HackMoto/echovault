// EchoVault mobile — what each caregiver access level may do (Module 02, AUTH-3).
//
// Mirrors the hub's rules (backend/app/middleware/dependencies.py
// enforce_access_level and require_admin) so the caregiver app can hide what
// the current caregiver cannot do. The hub enforces them anyway: hiding a
// button is for clarity, not security. No React Native imports.

import type { AccessLevel } from "../types";

export type CaregiverAction =
  | "read" // view anything in caregiver mode
  | "create" // add a person, memory, schedule item, medication...
  | "update" // edit, verify, confirm a dose, change settings
  | "delete" // remove a record
  | "export_backup"
  | "import_backup"; // replaces all data

const ALLOWED: Record<AccessLevel, readonly CaregiverAction[]> = {
  admin: ["read", "create", "update", "delete", "export_backup", "import_backup"],
  editor: ["read", "create", "update", "export_backup"],
  viewer: ["read", "export_backup"],
};

/** Whether a caregiver with this access level may do the action. Null (not signed in) may do nothing. */
export function can(level: AccessLevel | null | undefined, action: CaregiverAction): boolean {
  return level ? ALLOWED[level].includes(action) : false;
}
