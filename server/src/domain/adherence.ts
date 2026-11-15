import type { Dose, Medication } from "./types.js";

export interface DayAdherence {
  date: string;
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
}

export interface AdherenceReport {
  days: number;
  rate: number | null;
  streakDays: number;
  byDay: DayAdherence[];
  byMedication: Array<{ medicationId: string; name: string; rate: number | null }>;
}

const ratio = (taken: number, settled: number): number | null =>
  settled === 0 ? null : Math.round((taken / settled) * 100) / 100;

/**
 * Summarises dose outcomes. Only settled doses (taken, skipped, missed) count toward
 * the rate, so a dose that is merely upcoming never lowers it.
 * `dosesByDate` must be ordered oldest → newest.
 */
export function buildAdherence(
  dosesByDate: ReadonlyArray<{ date: string; doses: readonly Dose[] }>,
  meds: readonly Medication[],
): AdherenceReport {
  const perMed = new Map<string, { taken: number; settled: number }>();
  let taken = 0;
  let settled = 0;

  const byDay = dosesByDate.map(({ date, doses }) => {
    const day: DayAdherence = { date, scheduled: doses.length, taken: 0, skipped: 0, missed: 0 };
    for (const d of doses) {
      if (d.status === "due" || d.status === "upcoming") continue;
      day[d.status] += 1;
      const m = perMed.get(d.medicationId) ?? { taken: 0, settled: 0 };
      m.settled += 1;
      if (d.status === "taken") m.taken += 1;
      perMed.set(d.medicationId, m);
    }
    taken += day.taken;
    settled += day.taken + day.skipped + day.missed;
    return day;
  });

  return {
    days: dosesByDate.length,
    rate: ratio(taken, settled),
    streakDays: streak(byDay),
    byDay,
    byMedication: meds
      .filter((m) => perMed.has(m.id))
      .map((m) => {
        const s = perMed.get(m.id)!;
        return { medicationId: m.id, name: m.name, rate: ratio(s.taken, s.settled) };
      }),
  };
}

/** Consecutive most-recent days on which every settled dose was taken. Days with nothing scheduled are neutral. */
function streak(byDay: readonly DayAdherence[]): number {
  let count = 0;
  for (let i = byDay.length - 1; i >= 0; i--) {
    const d = byDay[i]!;
    const settled = d.taken + d.skipped + d.missed;
    const unsettled = d.scheduled - settled;
    if (d.scheduled === 0) continue;
    if (d.skipped > 0 || d.missed > 0) break;
    if (unsettled > 0) {
      // Today, still in progress: neither extends nor breaks the streak.
      if (i === byDay.length - 1) continue;
      break;
    }
    count += 1;
  }
  return count;
}
