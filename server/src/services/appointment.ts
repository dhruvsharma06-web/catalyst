import { newId } from "../domain/ids.js";
import type { Actor, Appointment } from "../domain/types.js";
import { notFound } from "../http/errors.js";
import { recordActivity } from "./activity.js";
import type { Deps } from "./deps.js";

export type AppointmentInput = Omit<Appointment, "id" | "createdBy" | "updatedAt">;

export async function listAppointments(deps: Deps, circleId: string, scope: "upcoming" | "past" | "all"): Promise<Appointment[]> {
  const nowIso = deps.now().toISOString();
  const all = await deps.store.appointments.list(circleId, { orderBy: { field: "startsAt", direction: "asc" } });
  if (scope === "all") return all;
  // An appointment stays "upcoming" until it has ended.
  const ended = (a: Appointment) => new Date(new Date(a.startsAt).getTime() + a.durationMinutes * 60_000).toISOString() < nowIso;
  return scope === "upcoming" ? all.filter((a) => !ended(a)) : all.filter(ended).reverse();
}

export async function getAppointment(deps: Deps, circleId: string, id: string): Promise<Appointment> {
  const apt = await deps.store.appointments.get(circleId, id);
  if (!apt) throw notFound("Appointment");
  return apt;
}

export async function createAppointment(deps: Deps, actor: Actor, input: AppointmentInput): Promise<Appointment> {
  const apt: Appointment = { ...input, id: newId("apt"), createdBy: actor.name, updatedAt: deps.now().toISOString() };
  await deps.store.appointments.put(actor.circleId, apt);
  await recordActivity(deps, actor, "appointment.created", `${actor.name} added a visit with ${apt.doctorName}`);
  return apt;
}

export async function updateAppointment(deps: Deps, actor: Actor, id: string, patch: Partial<AppointmentInput>): Promise<Appointment> {
  const current = await getAppointment(deps, actor.circleId, id);
  const next: Appointment = { ...current, ...patch, updatedAt: deps.now().toISOString() };
  await deps.store.appointments.put(actor.circleId, next);
  await recordActivity(deps, actor, "appointment.updated", `${actor.name} updated the visit with ${next.doctorName}`);
  return next;
}

export async function deleteAppointment(deps: Deps, actor: Actor, id: string): Promise<void> {
  const current = await getAppointment(deps, actor.circleId, id);
  await deps.store.appointments.delete(actor.circleId, id);
  await recordActivity(deps, actor, "appointment.deleted", `${actor.name} removed the visit with ${current.doctorName}`);
}
