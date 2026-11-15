import { DateTime } from "luxon";
import { addDays, dosesForDate, localToUtc, parseDoseId, todayIn, isScheduledOn } from "../domain/schedule.js";
import { buildAdherence, type AdherenceReport } from "../domain/adherence.js";
import type { Actor, Dose, DoseLog, Medication } from "../domain/types.js";
import { AppError, notFound } from "../http/errors.js";
import { recordActivity } from "./activity.js";
import type { Deps } from "./deps.js";

/** Doses can be logged at most this far ahead (e.g. tomorrow morning's dose taken tonight is not allowed). */
const MAX_LOG_AHEAD_HOURS = 36;

async function logsBetween(deps: Deps, circleId: string, from: string, to: string): Promise<Map<string, DoseLog>> {
  const logs = await deps.store.doseLogs.list(circleId, {
    where: [
      { field: "date", op: ">=", value: from },
      { field: "date", op: "<=", value: to },
    ],
  });
  return new Map(logs.map((l) => [l.id, l]));
}

export async function getDoses(deps: Deps, circleId: string, timezone: string, date?: string): Promise<{ date: string; doses: Dose[] }> {
  const day = date ?? todayIn(timezone, deps.now());
  const [meds, logs] = await Promise.all([deps.store.medications.list(circleId), logsBetween(deps, circleId, day, day)]);
  return { date: day, doses: dosesForDate(meds, logs, day, timezone, deps.now()) };
}

export async function logDose(
  deps: Deps,
  actor: Actor,
  timezone: string,
  doseIdValue: string,
  status: "taken" | "skipped",
): Promise<Dose> {
  const parsed = parseDoseId(doseIdValue);
  if (!parsed) throw notFound("Dose");
  const med = await deps.store.medications.get(actor.circleId, parsed.medicationId);
  if (!med || !isScheduledOn(med, parsed.date) || !med.times.includes(parsed.time)) throw notFound("Dose");

  const scheduled = localToUtc(parsed.date, parsed.time, timezone);
  const hoursAhead = scheduled.diff(DateTime.fromJSDate(deps.now()), "hours").hours;
  if (hoursAhead > MAX_LOG_AHEAD_HOURS) {
    throw new AppError("INVALID_INPUT", "That dose is too far in the future to record.", [{ field: "doseId", reason: "Too far ahead" }]);
  }

  const previous = await deps.store.doseLogs.get(actor.circleId, doseIdValue);
  const log: DoseLog = {
    id: doseIdValue,
    medicationId: med.id,
    date: parsed.date,
    time: parsed.time,
    status,
    loggedAt: deps.now().toISOString(),
    loggedBy: actor.name,
  };
  await deps.store.doseLogs.put(actor.circleId, log);
  await adjustStock(deps, actor.circleId, med, previous?.status === "taken", status === "taken");
  await recordActivity(
    deps,
    actor,
    `dose.${status}`,
    `${actor.name} marked ${med.name} (${parsed.time}) as ${status === "taken" ? "taken" : "skipped"}`,
  );

  const logs = new Map([[log.id, log]]);
  const dose = dosesForDate([med], logs, parsed.date, timezone, deps.now()).find((d) => d.id === doseIdValue);
  if (!dose) throw notFound("Dose");
  return dose;
}

/** Keeps the pill count honest when a dose flips between taken and not taken. */
async function adjustStock(deps: Deps, circleId: string, med: Medication, wasTaken: boolean, isTaken: boolean): Promise<void> {
  if (med.stock === null || wasTaken === isTaken) return;
  const stock = Math.max(0, med.stock + (isTaken ? -1 : 1));
  await deps.store.medications.put(circleId, { ...med, stock });
}

export async function getAdherence(deps: Deps, circleId: string, timezone: string, days: number): Promise<AdherenceReport> {
  const today = todayIn(timezone, deps.now());
  const from = addDays(today, -(days - 1));
  const [meds, logs] = await Promise.all([deps.store.medications.list(circleId), logsBetween(deps, circleId, from, today)]);
  const series = Array.from({ length: days }, (_, i) => {
    const date = addDays(from, i);
    return { date, doses: dosesForDate(meds, logs, date, timezone, deps.now()) };
  });
  return buildAdherence(series, meds);
}
