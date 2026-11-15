import { newId } from "../domain/ids.js";
import type { Actor, Medication } from "../domain/types.js";
import { AppError, notFound } from "../http/errors.js";
import { recordActivity } from "./activity.js";
import type { Deps } from "./deps.js";

export type MedicationInput = Omit<Medication, "id" | "createdBy" | "updatedAt" | "active">;
export type MedicationPatch = Partial<MedicationInput & { active: boolean }>;

export async function listMedications(deps: Deps, circleId: string): Promise<Medication[]> {
  const meds = await deps.store.medications.list(circleId);
  return meds.sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
}

export async function createMedication(deps: Deps, actor: Actor, input: MedicationInput): Promise<Medication> {
  const med: Medication = {
    ...input,
    id: newId("med"),
    active: true,
    createdBy: actor.name,
    updatedAt: deps.now().toISOString(),
  };
  await deps.store.medications.put(actor.circleId, med);
  await recordActivity(deps, actor, "medication.created", `${actor.name} added ${med.name} ${med.dosage} at ${med.times.join(", ")}`);
  return med;
}

export async function updateMedication(deps: Deps, actor: Actor, id: string, patch: MedicationPatch): Promise<Medication> {
  const current = await deps.store.medications.get(actor.circleId, id);
  if (!current) throw notFound("Medicine");
  const next: Medication = { ...current, ...patch, updatedAt: deps.now().toISOString() };
  // A partial update can invert the range even when each field is valid alone.
  if (next.endDate !== null && next.endDate < next.startDate) {
    throw new AppError("INVALID_INPUT", "End date must be on or after the start date.", [
      { field: "endDate", reason: "Before start date" },
    ]);
  }
  await deps.store.medications.put(actor.circleId, next);
  await recordActivity(deps, actor, "medication.updated", `${actor.name} ${describeChange(current, next)}`);
  return next;
}

export async function deleteMedication(deps: Deps, actor: Actor, id: string): Promise<void> {
  const current = await deps.store.medications.get(actor.circleId, id);
  if (!current) throw notFound("Medicine");
  await deps.store.medications.delete(actor.circleId, id);
  await recordActivity(deps, actor, "medication.deleted", `${actor.name} removed ${current.name}`);
}

function describeChange(before: Medication, after: Medication): string {
  if (before.active !== after.active) return `${after.active ? "resumed" : "paused"} ${after.name}`;
  if (before.times.join() !== after.times.join()) return `changed ${after.name} times to ${after.times.join(", ")}`;
  if (before.dosage !== after.dosage) return `changed ${after.name} dose to ${after.dosage}`;
  return `updated ${after.name}`;
}
