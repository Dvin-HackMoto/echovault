// EchoVault mobile — the signed-in caregiver (CGV-1).
// Who is signed in and what their access level allows (src/auth/access.ts
// mirrors the hub's rules; the hub enforces them anyway). Leaving caregiver mode
// forgets the caregiver, so the PIN is needed again.

import React, { createContext, useContext } from "react";

import type { CaregiverIdentity } from "../api/auth";
import { can, type CaregiverAction } from "../auth/access";

interface Session {
  caregiver: CaregiverIdentity;
  can: (action: CaregiverAction) => boolean;
  /** Leave caregiver mode (back to the patient app). */
  signOut: () => Promise<void>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ caregiver, signOut, children }: { caregiver: CaregiverIdentity; signOut: () => Promise<void>; children: React.ReactNode }) {
  const value: Session = { caregiver, signOut, can: (action) => can(caregiver.access_level, action) };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession(): Session {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside the caregiver app");
  return value;
}
