import type { AiClient, CareFacts, SummaryOutput } from "./types.js";

const pct = (r: number) => `${Math.round(r * 100)}%`;

/**
 * Deterministic, rules-based summary. Used as the offline fallback and by the
 * local client, so the feature stays useful without a model.
 */
export function rulesSummary(f: CareFacts): SummaryOutput {
  const highlights: string[] = [];
  const attention: string[] = [];
  const rateText = f.adherenceRate === null ? null : pct(f.adherenceRate);

  if (rateText) highlights.push(`${f.elderFirstName} took ${rateText} of scheduled medicines over the last ${f.periodDays} days.`);
  if (f.streakDays > 1) highlights.push(`${f.streakDays} days in a row with every medicine taken.`);
  for (const m of f.perMedication.filter((m) => m.rate === 1).slice(0, 2)) highlights.push(`${m.name}: never missed.`);

  const missedByMed = new Map<string, number>();
  for (const d of f.missedDoses) missedByMed.set(d.medication, (missedByMed.get(d.medication) ?? 0) + 1);
  for (const [name, n] of [...missedByMed].slice(0, 2)) attention.push(`${name} was missed ${n} time${n > 1 ? "s" : ""} — worth a gentle check-in.`);
  for (const s of f.lowStock.slice(0, 2)) attention.push(`${s.name} is running low (${s.left} left) — plan a refill.`);
  for (const a of f.upcomingAppointments.slice(0, 2)) attention.push(`Visit with ${a.doctor}${a.specialty ? ` (${a.specialty})` : ""} on ${a.startsLocal}.`);

  const summary =
    rateText === null
      ? `No medicine doses have been recorded for ${f.elderFirstName} in the last ${f.periodDays} days yet.`
      : `${f.elderFirstName} took ${rateText} of medicines this period${f.missedDoses.length ? `, with ${f.missedDoses.length} missed dose${f.missedDoses.length > 1 ? "s" : ""}` : " and missed none"}.` +
        (f.upcomingAppointments.length ? ` There ${f.upcomingAppointments.length > 1 ? "are" : "is"} ${f.upcomingAppointments.length} upcoming appointment${f.upcomingAppointments.length > 1 ? "s" : ""}.` : "");

  return { summary, highlights: highlights.slice(0, 4), attention: attention.slice(0, 4) };
}

/** Local client used when no Gemini credentials are configured (development, tests, demos). */
export function createLocalAiClient(): AiClient {
  return {
    modelVersion: "mock",
    async scanPrescription() {
      return {
        medications: [
          { name: "Metformin", dosage: "500 mg", instructions: "Take with food", times: ["08:00", "20:00"], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
          { name: "Amlodipine", dosage: "5 mg", instructions: "", times: ["09:00"], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] },
        ],
        confidence: 0.5,
        notes: "Sample result: image reading is not configured on this server, so this is example data.",
      };
    },
    async summarizeCare(facts) {
      return rulesSummary(facts);
    },
  };
}
