import { DateTime } from "luxon";
import type { Dose, DoseLog, DoseStatus, Medication } from "./types.js";

/** A dose becomes "due" this long before its scheduled time. */
export const DUE_WINDOW_BEFORE_MIN = 15;
/** After this long without a log, a dose is "missed". */
export const MISSED_AFTER_MIN = 60;

const DOSE_ID = /^(.+)_(\d{4}-\d{2}-\d{2})_(\d{4})$/;

export function doseId(medicationId: string, date: string, time: string): string {
  return `${medicationId}_${date}_${time.replace(":", "")}`;
}

export function parseDoseId(id: string): { medicationId: string; date: string; time: string } | null {
  const m = DOSE_ID.exec(id);
  if (!m?.[1] || !m[2] || !m[3]) return null;
  return { medicationId: m[1], date: m[2], time: `${m[3].slice(0, 2)}:${m[3].slice(2)}` };
}

/** Converts a local calendar date + HH:mm in `zone` to a UTC instant. */
export function localToUtc(date: string, time: string, zone: string): DateTime {
  return DateTime.fromISO(`${date}T${time}`, { zone }).toUTC();
}

export function todayIn(zone: string, now: Date = new Date()): string {
  return DateTime.fromJSDate(now, { zone }).toISODate() ?? DateTime.fromJSDate(now).toUTC().toISODate()!;
}

/** Shifts an ISO date (YYYY-MM-DD) by whole days. */
export function addDays(date: string, days: number): string {
  return DateTime.fromISO(date, { zone: "UTC" }).plus({ days }).toISODate()!;
}

/** 0 = Sunday … 6 = Saturday, matching JavaScript's Date#getDay. */
export function weekdayOf(date: string): number {
  return DateTime.fromISO(date, { zone: "UTC" }).weekday % 7;
}

export function isScheduledOn(med: Medication, date: string): boolean {
  if (!med.active) return false;
  if (date < med.startDate) return false;
  if (med.endDate && date > med.endDate) return false;
  return med.daysOfWeek.includes(weekdayOf(date));
}

export function statusAt(scheduledAt: DateTime, now: DateTime): Exclude<DoseStatus, "taken" | "skipped"> {
  const minutesUntil = scheduledAt.diff(now, "minutes").minutes;
  if (minutesUntil > DUE_WINDOW_BEFORE_MIN) return "upcoming";
  if (minutesUntil >= -MISSED_AFTER_MIN) return "due";
  return "missed";
}

/**
 * Expands medication schedules into the concrete doses for one local date,
 * merged with any taken/skipped logs. Pure: all inputs are explicit.
 */
export function dosesForDate(
  meds: readonly Medication[],
  logs: ReadonlyMap<string, DoseLog>,
  date: string,
  zone: string,
  now: Date,
): Dose[] {
  const nowUtc = DateTime.fromJSDate(now).toUTC();
  const doses: Dose[] = [];
  for (const med of meds) {
    if (!isScheduledOn(med, date)) continue;
    for (const time of med.times) {
      const id = doseId(med.id, date, time);
      const scheduled = localToUtc(date, time, zone);
      const log = logs.get(id);
      doses.push({
        id,
        medicationId: med.id,
        name: med.name,
        dosage: med.dosage,
        color: med.color,
        shape: med.shape,
        time,
        scheduledAt: scheduled.toISO({ suppressMilliseconds: true })!,
        status: log ? log.status : statusAt(scheduled, nowUtc),
        loggedAt: log?.loggedAt ?? null,
        loggedBy: log?.loggedBy ?? null,
      });
    }
  }
  return doses.sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt) || a.name.localeCompare(b.name));
}
