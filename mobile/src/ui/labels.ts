// EchoVault mobile — words the screens show for the hub's enum values.
// Plain module (no React); icons for these live in src/ui/icons.tsx.

import type { Category, Importance, Memory, ScheduleKind, Trust, Validity } from "../types";

export type Lang = "en" | "fil";

/** Pick the English or Filipino text. */
export const t = (lang: Lang, en: string, fil: string) => (lang === "fil" ? fil : en);

export const CATEGORY_ORDER: Category[] = ["identity", "routine", "history", "preference", "care_safety", "engagement"];

export const categoryLabel: Record<Category, { en: string; fil: string }> = {
  identity: { en: "Family & People", fil: "Pamilya at Kakilala" },
  routine: { en: "Daily Routines", fil: "Araw-araw na Gawain" },
  history: { en: "Life Stories", fil: "Mga Kuwento ng Buhay" },
  preference: { en: "Preferences", fil: "Mga Gusto" },
  care_safety: { en: "Care & Safety", fil: "Pag-aalaga at Kaligtasan" },
  engagement: { en: "Activities", fil: "Mga Gawain" },
};

/** Gradient behind a memory tile, by category. */
export const categoryHue: Record<Category, [string, string]> = {
  identity: ["#F7D7D9", "#F7C96B"],
  routine: ["#EAF3FC", "#729AC9"],
  history: ["#E3F1EA", "#86BFA0"],
  preference: ["#F7D7D9", "#FFF8EB"],
  care_safety: ["#F7D7D9", "#E9A6AC"],
  engagement: ["#EEE8F7", "#A897CF"],
};

export const trustLabel: Record<Trust, { short: string; long: string; fil: string }> = {
  verified: { short: "Verified", long: "Verified", fil: "Napatunayan" },
  unverified: { short: "Unverified", long: "Not yet verified", fil: "Hindi pa napatunayan" },
  conflicting: { short: "Conflicting", long: "Records disagree", fil: "Magkaiba ang tala" },
  outdated: { short: "Outdated", long: "Outdated", fil: "Luma na" },
};

export const TRUST_ORDER: Trust[] = ["verified", "unverified", "conflicting", "outdated"];
export const IMPORTANCE_ORDER: Importance[] = ["critical", "important", "general"];
export const VALIDITY_ORDER: Validity[] = ["persistent", "scheduled", "temporary"];

export const importanceLabel: Record<Importance, string> = { critical: "Critical", important: "Important", general: "General" };
export const validityLabel: Record<Validity, string> = {
  persistent: "Persistent",
  scheduled: "Scheduled",
  temporary: "Temporary",
  archived: "Archived",
};

export const KIND_ORDER: ScheduleKind[] = ["appointment", "meal", "routine", "visit", "activity"];
export const kindLabel: Record<ScheduleKind, string> = {
  appointment: "Appointment",
  meal: "Meal",
  routine: "Routine",
  visit: "Visit",
  activity: "Activity",
};

/** A memory's heading: its title, or the start of its text. */
export function memoryTitle(m: Pick<Memory, "title" | "content">): string {
  if (m.title?.trim()) return m.title.trim();
  const first = m.content.split(/(?<=[.!?])\s/)[0] ?? m.content;
  return first.length > 60 ? `${first.slice(0, 57).trimEnd()}…` : first;
}

/** "2026-03-12" -> "March 12, 2026"; anything else is shown as it is. */
export function dayLabel(value: string | null | undefined): string | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (!m) return value;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return d.toLocaleDateString("en-PH", { month: "long", day: "numeric", year: "numeric" });
}

export function greet(d: Date, lang: Lang): string {
  const h = d.getHours();
  if (lang === "fil") return h < 12 ? "Magandang umaga" : h < 18 ? "Magandang hapon" : "Magandang gabi";
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export function longDate(d: Date, lang: Lang): string {
  return d.toLocaleDateString(lang === "fil" ? "fil-PH" : "en-PH", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

/** Recurrence string (hub format) as words: null | daily | weekly:MO,WE | monthly:15. */
export function recurrenceLabel(rec: string | null | undefined): string {
  if (!rec) return "Once";
  if (rec === "daily") return "Every day";
  const [kind, arg] = rec.split(":");
  if (kind === "weekly") {
    const names: Record<string, string> = { MO: "Mon", TU: "Tue", WE: "Wed", TH: "Thu", FR: "Fri", SA: "Sat", SU: "Sun" };
    return `Every ${arg.split(",").map((d) => names[d] ?? d).join(", ")}`;
  }
  if (kind === "monthly") return `Monthly on day ${arg}`;
  return rec;
}
