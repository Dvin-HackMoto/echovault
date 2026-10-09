// EchoVault mobile — people API.
// Wired to the ARCHITECTURE-named routes (people CRUD + photo upload) pending
// the backend People module. All calls go through the shared client.

import { del, get, post, put, uploadFile } from "./client";
import type { UploadFile } from "./client";
import type { Person } from "../types";

/** Fields a caregiver can write when creating/updating a person. */
export type PersonInput = Partial<Omit<Person, "id" | "created_at" | "updated_at">>;

/** List everyone (optionally only caregivers via is_caregiver filter server-side). */
export function listPeople(): Promise<Person[]> {
  return get<Person[]>("/people");
}

/**
 * Patient mode: verified people only. The hub filters (ASSUMED: `trust` query
 * filter); the check here is a second guard so an unverified record is never shown.
 */
export async function listVerifiedPeople(): Promise<Person[]> {
  const people = await get<Person[]>("/people?trust=verified");
  return people.filter((person) => person.trust === "verified");
}

export function getPerson(id: string): Promise<Person> {
  return get<Person>(`/people/${id}`);
}

export function createPerson(input: PersonInput): Promise<Person> {
  return post<Person>("/people", input);
}

export function updatePerson(id: string, input: PersonInput): Promise<Person> {
  return put<Person>(`/people/${id}`, input);
}

export function deletePerson(id: string): Promise<void> {
  return del<void>(`/people/${id}`);
}

/** Upload a person's photo (multipart). POST /people/{id}/photo. */
export function uploadPersonPhoto(id: string, file: UploadFile): Promise<Person> {
  return uploadFile<Person>(`/people/${id}/photo`, "file", file);
}
