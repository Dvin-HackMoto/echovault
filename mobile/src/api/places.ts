// EchoVault mobile — places API.
// The hub's places routes (backend/app/features/places/router.py): CRUD + photo
// upload. All calls go through the shared client.

import { del, get, post, put, uploadFile } from "./client";
import type { UploadFile } from "./client";
import type { Place, Trust } from "../types";

/**
 * Fields a caregiver can write when creating/updating a place. The photo is
 * not one of them: it only changes through `uploadPlacePhoto`.
 */
export type PlaceInput = Partial<Pick<Place, "name" | "description" | "address" | "trust">>;

/**
 * List places by name. A caregiver can filter by trust; in patient mode the
 * hub only ever returns verified places.
 */
export function listPlaces(trust?: Trust): Promise<Place[]> {
  return get<Place[]>(trust ? `/places?trust=${trust}` : "/places");
}

export function getPlace(id: string): Promise<Place> {
  return get<Place>(`/places/${id}`);
}

/** New places start as "unverified" unless `trust` is sent. */
export function createPlace(input: PlaceInput): Promise<Place> {
  return post<Place>("/places", input);
}

export function updatePlace(id: string, input: PlaceInput): Promise<Place> {
  return put<Place>(`/places/${id}`, input);
}

export function deletePlace(id: string): Promise<void> {
  return del<void>(`/places/${id}`);
}

/** Upload a place's photo (multipart field `photo`; JPEG, PNG or WebP up to 10 MB). */
export function uploadPlacePhoto(id: string, file: UploadFile): Promise<Place> {
  return uploadFile<Place>(`/places/${id}/photo`, "photo", file);
}
