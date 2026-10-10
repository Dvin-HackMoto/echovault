// EchoVault mobile — memories API (backend/app/features/memories/router.py):
// CRUD, verify, resolve and the filtered list. All calls go through the shared client.
// In patient mode the hub only ever returns verified, currently valid memories.

import { del, get, post, put } from "./client";
import type { Category, Memory, Trust } from "../types";

export type MemoryInput = Partial<Omit<Memory, "id" | "created_at" | "updated_at">>;

/** Optional filters for GET /memories?trust=&category=. */
export interface MemoryFilter {
  trust?: Trust;
  category?: Category;
  person_id?: string;
}

function queryString(filter?: MemoryFilter): string {
  if (!filter) return "";
  const params: string[] = [];
  if (filter.trust) params.push(`trust=${encodeURIComponent(filter.trust)}`);
  if (filter.category) params.push(`category=${encodeURIComponent(filter.category)}`);
  if (filter.person_id) params.push(`person_id=${encodeURIComponent(filter.person_id)}`);
  return params.length ? `?${params.join("&")}` : "";
}

export function listMemories(filter?: MemoryFilter): Promise<Memory[]> {
  return get<Memory[]>(`/memories${queryString(filter)}`);
}

/**
 * Patient mode: verified, current memories about one person. The filter is a
 * second guard: the patient never sees an unverified, conflicting, outdated or
 * archived memory.
 */
export async function verifiedMemoriesAbout(personId: string): Promise<Memory[]> {
  const memories = await listMemories({ trust: "verified", person_id: personId });
  return memories.filter(
    (memory) => memory.trust === "verified" && memory.validity !== "archived" && memory.person_id === personId,
  );
}

export function getMemory(id: string): Promise<Memory> {
  return get<Memory>(`/memories/${id}`);
}

export function createMemory(input: MemoryInput): Promise<Memory> {
  return post<Memory>("/memories", input);
}

export function updateMemory(id: string, input: MemoryInput): Promise<Memory> {
  return put<Memory>(`/memories/${id}`, input);
}

export function deleteMemory(id: string): Promise<void> {
  return del<void>(`/memories/${id}`);
}

/** Mark a memory verified. POST /memories/{id}/verify. */
export function verifyMemory(id: string): Promise<Memory> {
  return post<Memory>(`/memories/${id}/verify`);
}

/**
 * Resolve a conflict (MEM-4): keep this memory as the verified one and send the
 * memory it conflicts with to "archived" (default) or "outdated", in one step.
 * POST /memories/{id}/resolve; 400 when the memory is not in a conflict.
 */
export function resolveMemory(id: string, otherOutcome: "archived" | "outdated" = "archived"): Promise<Memory> {
  return post<Memory>(`/memories/${id}/resolve`, { other_outcome: otherOutcome });
}
