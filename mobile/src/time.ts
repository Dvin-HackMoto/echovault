// EchoVault mobile — time helpers.
// The hub stores local time as "YYYY-MM-DD HH:MM:SS" (Manila). The phone is in
// the same place, so these helpers treat those strings as the phone's local
// time. No React Native imports (unit-tested).

const pad = (n: number) => String(n).padStart(2, "0");

export function toStamp(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

export function fromStamp(stamp: string): Date {
  const [day, time = "00:00:00"] = stamp.split(" ");
  const [y, m, d] = day.split("-").map(Number);
  const [hh, mm, ss = 0] = time.split(":").map(Number);
  return new Date(y, m - 1, d, hh, mm, ss);
}

/** "20:00" or "2026-10-10 20:00:00" -> "8:00 PM" */
export function clockLabel(value: string): string {
  const time = value.includes(" ") ? value.split(" ")[1] : value;
  const [h, m] = time.split(":").map(Number);
  return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? "AM" : "PM"}`;
}

/** The current time as "8:05 PM". */
export function nowLabel(d: Date): string {
  return clockLabel(`${d.getHours()}:${d.getMinutes()}`);
}

export function dateLabel(d: Date): string {
  return d.toLocaleDateString("en-PH", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Magandang umaga";
  if (h < 18) return "Magandang hapon";
  return "Magandang gabi";
}
