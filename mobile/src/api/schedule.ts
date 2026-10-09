// EchoVault mobile — schedule API.
// Wired to the ARCHITECTURE-named routes (CRUD, today/next, acks) pending the
// backend Schedule module. All calls go through the shared client.

import { del, get, post, put } from "./client";
import type { AckResponse, ScheduleAck, ScheduleItem, ScheduleOccurrence } from "../types";

export type ScheduleInput = Partial<Omit<ScheduleItem, "id" | "updated_at">>;

export function listSchedule(): Promise<ScheduleItem[]> {
  return get<ScheduleItem[]>("/schedule");
}

export function getScheduleItem(id: string): Promise<ScheduleItem> {
  return get<ScheduleItem>(`/schedule/${id}`);
}

export function createScheduleItem(input: ScheduleInput): Promise<ScheduleItem> {
  return post<ScheduleItem>("/schedule", input);
}

export function updateScheduleItem(id: string, input: ScheduleInput): Promise<ScheduleItem> {
  return put<ScheduleItem>(`/schedule/${id}`, input);
}

export function deleteScheduleItem(id: string): Promise<void> {
  return del<void>(`/schedule/${id}`);
}

/** Today's occurrences (recurrence expanded server-side). GET /schedule/today. */
export function todaySchedule(): Promise<ScheduleOccurrence[]> {
  return get<ScheduleOccurrence[]>("/schedule/today");
}

/** Occurrences on another day ("YYYY-MM-DD"), e.g. tomorrow. GET /schedule/today?date=. */
export function scheduleOn(date: string): Promise<ScheduleOccurrence[]> {
  return get<ScheduleOccurrence[]>(`/schedule/today?date=${encodeURIComponent(date)}`);
}

/** The single next upcoming occurrence, or null. GET /schedule/next. */
export function nextSchedule(): Promise<ScheduleOccurrence | null> {
  return get<ScheduleOccurrence | null>("/schedule/next");
}

/** Record that the patient saw an occurrence (acknowledged/dismissed/snoozed). */
export function ackSchedule(
  scheduleItemId: string,
  occurrenceAt: string,
  response: AckResponse,
): Promise<ScheduleAck> {
  return post<ScheduleAck>(`/schedule/${encodeURIComponent(scheduleItemId)}/ack`, {
    occurrence_at: occurrenceAt,
    response,
  });
}
