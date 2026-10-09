// EchoVault mobile — memories API.
// Wired to the ARCHITECTURE-named routes (CRUD, verify, filtered list) pending
// the backend Memories module. All calls go through the shared client.

import { del, get, post, put } from "./client";
import type { Category, Memory, Trust } from "../types";

export type MemoryInput = Partial<Omit<Memory, "id" | "created_at" | "updated_at">>;

/** Optional filters for GET /memories?trust=&category=. */
export interface MemoryFilter {
  trust?: Trust;
  category?: Category;
}

function queryString(filter?: MemoryFilter): string {
  if (!filter) return "";
  const params: string[] = [];
  if (filter.trust) params.push(`trust=${encodeURIComponent(filter.trust)}`);
  if (filter.category) params.push(`category=${encodeURIComponent(filter.category)}`);
  return params.length ? `?${params.join("&")}` : "";
}

export function listMemories(filter?: MemoryFilter): Promise<Memory[]> {
  return get<Memory[]>(`/memories${queryString(filter)}`);
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
