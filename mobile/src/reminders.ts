// EchoVault mobile — local notifications (ARCHITECTURE §6).
// Thin expo-notifications wrapper: request permission, cancel all, and
// schedule a local notification at (starts_at − remind_before_min). The
// notification fires on the phone even if the hub is off. Foundation-level;
// Module 14 owns the fetch loop that calls these.

import * as Notifications from "expo-notifications";

import type { ScheduleItem } from "./types";

/** Ask for notification permission. Returns true if granted. */
export async function requestPermission(): Promise<boolean> {
  const { status } = await Notifications.getPermissionsAsync();
  if (status === "granted") return true;
  const result = await Notifications.requestPermissionsAsync();
  return result.status === "granted";
}

/** Cancel every scheduled local notification (called before rescheduling). */
export function cancelAll(): Promise<void> {
  return Notifications.cancelAllScheduledNotificationsAsync();
}

/**
 * Schedule a reminder for one schedule item. Fires `remind_before_min` minutes
 * before `starts_at`; skips silently if that moment is already in the past.
 * Returns the scheduled notification id, or null if not scheduled.
 */
export async function scheduleReminder(item: ScheduleItem): Promise<string | null> {
  const startsAt = new Date(item.starts_at.replace(" ", "T"));
  const fireAt = new Date(startsAt.getTime() - item.remind_before_min * 60_000);
  if (Number.isNaN(fireAt.getTime()) || fireAt.getTime() <= Date.now()) {
    return null;
  }
  return Notifications.scheduleNotificationAsync({
    content: {
      title: item.title,
      body: item.notes ?? "You have something coming up.",
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: fireAt,
    },
  });
}

/** Cancel the old reminders and schedule the next batch. */
export async function rescheduleAll(items: ScheduleItem[]): Promise<void> {
  await cancelAll();
  await Promise.all(items.map((item) => scheduleReminder(item)));
}
