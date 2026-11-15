import type { Medication } from "../../api/types";

export const DAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"] as const;
export const ALL_DAYS: number[] = [0, 1, 2, 3, 4, 5, 6];

/** "08:00" -> "8:00 AM" in the viewer's locale. */
export function formatClock(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  return new Date(2000, 0, 1, h ?? 0, m ?? 0).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

export type PartOfDay = "Morning" | "Afternoon" | "Evening" | "Night";
export const PARTS_OF_DAY: readonly PartOfDay[] = ["Morning", "Afternoon", "Evening", "Night"];

export function partOfDay(hhmm: string): PartOfDay {
  const h = Number(hhmm.slice(0, 2));
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  if (h < 21) return "Evening";
  return "Night";
}

export function greetingFor(hhmm: string): string {
  const part = partOfDay(hhmm);
  return part === "Night" ? "Good evening" : `Good ${part.toLowerCase()}`;
}

export function formatLongDate(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, { timeZone, weekday: "long", day: "numeric", month: "long" }).format(new Date(iso));
}

export function formatDateTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat(undefined, {
    timeZone,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));
}

const RTF = new Intl.RelativeTimeFormat(undefined, { numeric: "auto" });

export function relativeTime(iso: string, now: number = Date.now()): string {
  const diffMin = Math.round((new Date(iso).getTime() - now) / 60_000);
  const abs = Math.abs(diffMin);
  if (abs < 1) return "just now";
  if (abs < 60) return RTF.format(diffMin, "minute");
  if (abs < 60 * 24) return RTF.format(Math.round(diffMin / 60), "hour");
  if (abs < 60 * 24 * 30) return RTF.format(Math.round(diffMin / (60 * 24)), "day");
  return RTF.format(Math.round(diffMin / (60 * 24 * 30)), "month");
}

export const percent = (rate: number | null): string => (rate === null ? "No data yet" : `${Math.round(rate * 100)}%`);

export function daysSummary(days: number[]): string {
  if (days.length === 7) return "Every day";
  return [...days].sort().map((d) => DAY_LABELS[d] ?? "").join(", ");
}

export function scheduleSummary(m: Pick<Medication, "times" | "daysOfWeek">): string {
  return `${m.times.map(formatClock).join(", ")} · ${daysSummary(m.daysOfWeek)}`;
}

export const isLowStock = (m: Pick<Medication, "stock" | "refillAt">): boolean =>
  m.stock !== null && m.refillAt !== null && m.stock <= m.refillAt;

export const ROLE_LABEL = { elder: "Elder", caretaker: "Caretaker", family: "Family" } as const;

export const REMINDER_PRESETS = [
  { minutes: 60, label: "1 hour before" },
  { minutes: 1440, label: "1 day before" },
  { minutes: 2880, label: "2 days before" },
] as const;

export function reminderLabel(minutes: number): string {
  const preset = REMINDER_PRESETS.find((p) => p.minutes === minutes);
  if (preset) return preset.label;
  if (minutes === 0) return "At the start time";
  if (minutes % 1440 === 0) return `${minutes / 1440} days before`;
  if (minutes % 60 === 0) return `${minutes / 60} hours before`;
  return `${minutes} minutes before`;
}
