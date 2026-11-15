import { DateTime } from "luxon";
import { rulesSummary } from "../adapters/ai/local.js";
import { AiUnavailableError, type CareFacts, type ScanOutput } from "../adapters/ai/types.js";
import type { Circle } from "../domain/types.js";
import { AppError } from "../http/errors.js";
import { listAppointments } from "./appointment.js";
import type { Deps } from "./deps.js";
import { getAdherence } from "./dose.js";
import { getDoses } from "./dose.js";
import { addDays, todayIn } from "../domain/schedule.js";

export interface ScanResult extends ScanOutput {
  model_version: string;
}

export interface CareSummary {
  summary: string;
  highlights: string[];
  attention: string[];
  model_version: string;
  generatedAt: string;
}

/** Caps model usage per circle per hour to bound cost and abuse. */
async function enforceAiQuota(deps: Deps, circleId: string): Promise<void> {
  const hourKey = `ai:${deps.now().toISOString().slice(0, 13)}`;
  const used = await deps.store.increment(circleId, hourKey);
  if (used > deps.config.AI_HOURLY_LIMIT) {
    throw new AppError("RATE_LIMITED", "You've used the smart features a lot this hour. Please try again later.");
  }
}

export async function scanPrescription(deps: Deps, circleId: string, imageBase64: string, mimeType: string): Promise<ScanResult> {
  const bytes = Buffer.byteLength(imageBase64, "base64");
  if (bytes > 5 * 1024 * 1024) throw new AppError("PAYLOAD_TOO_LARGE", "Please use a photo smaller than 5 MB.");
  await enforceAiQuota(deps, circleId);
  try {
    const out = await deps.ai.scanPrescription(imageBase64, mimeType);
    // Normalise: sorted, unique times; default to every day when the label gives no days.
    const medications = out.medications.map((m) => ({
      ...m,
      times: [...new Set(m.times)].sort(),
      daysOfWeek: m.daysOfWeek.length ? [...new Set(m.daysOfWeek)].sort((a, b) => a - b) : [0, 1, 2, 3, 4, 5, 6],
    }));
    return { ...out, medications, model_version: deps.ai.modelVersion };
  } catch (err) {
    if (err instanceof AiUnavailableError) throw new AppError("UPSTREAM_UNAVAILABLE", "We couldn't read the photo right now. Please try again or add the medicine by hand.");
    throw err;
  }
}

export async function buildCareFacts(deps: Deps, circle: Circle, days = 7): Promise<CareFacts> {
  const [adherence, appointments, meds] = await Promise.all([
    getAdherence(deps, circle.id, circle.timezone, days),
    listAppointments(deps, circle.id, "upcoming"),
    deps.store.medications.list(circle.id),
  ]);
  const today = todayIn(circle.timezone, deps.now());
  const recentDays = Array.from({ length: days }, (_, i) => addDays(today, -i));
  const dayDoses = await Promise.all(recentDays.map((d) => getDoses(deps, circle.id, circle.timezone, d)));
  const missedDoses = dayDoses
    .flatMap((d) => d.doses.filter((x) => x.status === "missed").map((x) => ({ medication: x.name, date: d.date, time: x.time })))
    .slice(0, 20);

  return {
    elderFirstName: circle.elderName.split(/\s+/)[0] ?? circle.elderName,
    periodDays: days,
    adherenceRate: adherence.rate,
    streakDays: adherence.streakDays,
    missedDoses,
    perMedication: adherence.byMedication.map((m) => ({ name: m.name, rate: m.rate })),
    upcomingAppointments: appointments.slice(0, 5).map((a) => ({
      doctor: a.doctorName,
      specialty: a.specialty,
      startsLocal: DateTime.fromISO(a.startsAt, { zone: circle.timezone }).toFormat("ccc d LLL, h:mm a"),
    })),
    lowStock: meds
      .filter((m) => m.active && m.stock !== null && m.refillAt !== null && m.stock <= m.refillAt)
      .map((m) => ({ name: m.name, left: m.stock ?? 0 })),
  };
}

export async function careSummary(deps: Deps, circle: Circle): Promise<CareSummary> {
  const facts = await buildCareFacts(deps, circle);
  const generatedAt = deps.now().toISOString();
  await enforceAiQuota(deps, circle.id);
  try {
    const out = await deps.ai.summarizeCare(facts);
    return { ...out, model_version: deps.ai.modelVersion, generatedAt };
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    deps.logger.warn({ err: err.message }, "care summary fell back to rules");
    // Honest fallback: the same facts, summarised by deterministic rules and labelled as such.
    return { ...rulesSummary(facts), model_version: "rules-fallback", generatedAt };
  }
}
