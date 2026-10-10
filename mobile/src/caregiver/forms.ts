// EchoVault mobile — form helpers for the caregiver screens. Plain module (no
// React Native) so it is unit-tested in tests/careForms.test.ts.

export const WEEKDAYS = ["MO", "TU", "WE", "TH", "FR", "SA", "SU"] as const;
export type Weekday = (typeof WEEKDAYS)[number];
export const WEEKDAY_LABEL: Record<Weekday, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };

export type Repeat = "once" | "daily" | "weekly" | "monthly";

/**
 * A time the caregiver typed, as the hub's 24-hour "HH:MM", or null.
 * Accepts "8:00", "08:00", "20:30", "8 pm", "8:30 AM", "12am".
 */
export function parseTime(input: string): string | null {
  const m = /^\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a\.m\.|p\.m\.)?\s*$/i.exec(input);
  if (!m) return null;
  let h = Number(m[1]);
  const min = m[2] ? Number(m[2]) : 0;
  const half = m[3]?.toLowerCase().replace(/\./g, "");
  if (min > 59) return null;
  if (half) {
    if (h < 1 || h > 12) return null;
    if (half === "am") h = h === 12 ? 0 : h;
    else h = h === 12 ? 12 : h + 12;
  } else if (h > 23) return null;
  // without am/pm, a bare hour still needs minutes ("8" is too ambiguous)
  if (!half && !m[2]) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}`;
}

/** The hub's recurrence string for the chosen repeat. */
export function buildRecurrence(repeat: Repeat, weekdays: Weekday[], date: string): string | null {
  if (repeat === "once") return null;
  if (repeat === "daily") return "daily";
  if (repeat === "weekly") {
    const days = WEEKDAYS.filter((d) => weekdays.includes(d));
    return days.length ? `weekly:${days.join(",")}` : null;
  }
  const day = Number(date.slice(8, 10));
  return day >= 1 && day <= 31 ? `monthly:${day}` : null;
}

/** Split a saved recurrence back into the form's choices. */
export function readRecurrence(rec: string | null | undefined): { repeat: Repeat; weekdays: Weekday[] } {
  if (!rec) return { repeat: "once", weekdays: [] };
  if (rec === "daily") return { repeat: "daily", weekdays: [] };
  const [kind, arg = ""] = rec.split(":");
  if (kind === "weekly") return { repeat: "weekly", weekdays: arg.split(",").filter((d): d is Weekday => (WEEKDAYS as readonly string[]).includes(d)) };
  if (kind === "monthly") return { repeat: "monthly", weekdays: [] };
  return { repeat: "once", weekdays: [] };
}

/** True for a real calendar date written "YYYY-MM-DD". */
export function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
}

/** Today's date as "YYYY-MM-DD" (phone time = hub time, both Manila). */
export function todayIso(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** Medicine days: "daily" or weekday codes, from the chosen weekdays (all or none = daily). */
export function medicineDays(weekdays: Weekday[]): string {
  const days = WEEKDAYS.filter((d) => weekdays.includes(d));
  return days.length === 0 || days.length === 7 ? "daily" : days.join(",");
}
