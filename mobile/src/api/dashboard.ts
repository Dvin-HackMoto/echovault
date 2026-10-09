// EchoVault mobile — caregiver dashboard API.
//
// Typed against the REAL backend (backend/app/features/dashboard/router.py):
//   GET /dashboard -> full lists for every review bullet in ARCHITECTURE §10.
//
// HARD PRODUCT CONSTRAINT: activity is reported as ENGAGEMENT only — played vs
// skipped counts, never a score / rating / percentage / accuracy. The
// `ActivitySummaryRow` type below deliberately has no such field.

import { get } from "./client";
import type {
  ActivityKind,
  AssistantLog,
  MedicationLogWithMed,
  Memory,
} from "../types";

/** One row of the engagement summary (no score — played vs skipped only). */
export interface ActivitySummaryRow {
  activity: ActivityKind;
  topic: string | null;
  played_count: number;
  skipped_count: number;
}

/** The GET /dashboard response, matching the router's returned keys exactly. */
export interface DashboardResponse {
  unverified_memories: Memory[];
  /** Deduped so each conflicting pair appears once (id < conflicts_with). */
  conflicting_pairs: Memory[];
  outdated_memories: Memory[];
  medication_attention: MedicationLogWithMed[];
  flagged_answers: AssistantLog[];
  activity_summary: ActivitySummaryRow[];
}

/** Fetch everything the caregiver needs to review. Caregiver only. */
export function getDashboard(): Promise<DashboardResponse> {
  return get<DashboardResponse>("/dashboard");
}
