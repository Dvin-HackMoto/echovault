// EchoVault mobile — people API.
// The hub's people routes (backend/app/features/people/router.py): CRUD + photo
// upload. All calls go through the shared client.

import { del, get, post, put, uploadFile } from "./client";
import type { UploadFile } from "./client";
import type { Person, Trust } from "../types";

/**
 * Fields a caregiver can write when creating/updating a person. The photo is
 * not one of them: it only changes through `uploadPersonPhoto`.
 */
export type PersonInput = Partial<
  Pick<Person, "name" | "nickname" | "relationship" | "notes" | "is_caregiver" | "trust">
>;

/**
 * List people by name. A caregiver can filter by trust (e.g. "unverified" for
 * the review list); in patient mode the hub only ever returns verified people.
 */
export function listPeople(trust?: Trust): Promise<Person[]> {
  return get<Person[]>(trust ? `/people?trust=${trust}` : "/people");
}

/**
 * Patient mode: verified people only. The hub only ever returns verified people
 * to the patient; the check here is a second guard.
 */
export async function listVerifiedPeople(): Promise<Person[]> {
  const people = await get<Person[]>("/people?trust=verified");
  return people.filter((person) => person.trust === "verified");
}

export function getPerson(id: string): Promise<Person> {
  return get<Person>(`/people/${id}`);
}

/** New people start as "unverified" unless `trust` is sent. */
export function createPerson(input: PersonInput): Promise<Person> {
  return post<Person>("/people", input);
}

/** Partial update. Setting `is_caregiver` on one person clears it on everyone else. */
export function updatePerson(id: string, input: PersonInput): Promise<Person> {
  return put<Person>(`/people/${id}`, input);
}

export function deletePerson(id: string): Promise<void> {
  return del<void>(`/people/${id}`);
}

/** Upload a person's photo (multipart field `photo`; JPEG, PNG or WebP up to 10 MB). */
export function uploadPersonPhoto(id: string, file: UploadFile): Promise<Person> {
  return uploadFile<Person>(`/people/${id}/photo`, "photo", file);
}
