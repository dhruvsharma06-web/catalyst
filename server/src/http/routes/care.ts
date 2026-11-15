import { Router } from "express";
import { appointmentToIcs } from "../../domain/ics.js";
import { listActivity } from "../../services/activity.js";
import * as appointments from "../../services/appointment.js";
import type { Deps } from "../../services/deps.js";
import * as doses from "../../services/dose.js";
import * as meds from "../../services/medication.js";
import { handle, parse, requireMember, session } from "../middleware.js";
import {
  createAppointmentSchema,
  createMedicationSchema,
  dateQuery,
  daysQuery,
  limitQuery,
  logDoseSchema,
  scopeQuery,
  updateAppointmentSchema,
  updateMedicationSchema,
} from "../schemas.js";

/** Medications, doses, adherence, appointments, activity and notification history. */
export function careRoutes(deps: Deps): Router {
  const r = Router();
  r.use(requireMember(deps));
  const id = (raw: unknown) => String(raw);

  r.get("/medications", handle(async (_req, res) => {
    res.json({ medications: await meds.listMedications(deps, session(res).circle.id) });
  }));
  r.post("/medications", handle(async (req, res) => {
    res.status(201).json(await meds.createMedication(deps, session(res).actor, parse(createMedicationSchema, req.body)));
  }));
  r.patch("/medications/:id", handle(async (req, res) => {
    res.json(await meds.updateMedication(deps, session(res).actor, id(req.params.id), parse(updateMedicationSchema, req.body)));
  }));
  r.delete("/medications/:id", handle(async (req, res) => {
    await meds.deleteMedication(deps, session(res).actor, id(req.params.id));
    res.status(204).end();
  }));

  r.get("/doses", handle(async (req, res) => {
    const { date } = parse(dateQuery, req.query);
    const { circle } = session(res);
    res.json(await doses.getDoses(deps, circle.id, circle.timezone, date));
  }));
  r.post("/doses/:id/log", handle(async (req, res) => {
    const { actor, circle } = session(res);
    const { status } = parse(logDoseSchema, req.body);
    res.json(await doses.logDose(deps, actor, circle.timezone, id(req.params.id), status));
  }));
  r.get("/adherence", handle(async (req, res) => {
    const { days } = parse(daysQuery, req.query);
    const { circle } = session(res);
    res.json(await doses.getAdherence(deps, circle.id, circle.timezone, days));
  }));

  r.get("/appointments", handle(async (req, res) => {
    const { scope } = parse(scopeQuery, req.query);
    res.json({ appointments: await appointments.listAppointments(deps, session(res).circle.id, scope) });
  }));
  r.post("/appointments", handle(async (req, res) => {
    res.status(201).json(await appointments.createAppointment(deps, session(res).actor, parse(createAppointmentSchema, req.body)));
  }));
  r.patch("/appointments/:id", handle(async (req, res) => {
    res.json(await appointments.updateAppointment(deps, session(res).actor, id(req.params.id), parse(updateAppointmentSchema, req.body)));
  }));
  r.delete("/appointments/:id", handle(async (req, res) => {
    await appointments.deleteAppointment(deps, session(res).actor, id(req.params.id));
    res.status(204).end();
  }));
  r.get("/appointments/:id/ics", handle(async (req, res) => {
    const { circle } = session(res);
    const apt = await appointments.getAppointment(deps, circle.id, id(req.params.id));
    res
      .type("text/calendar; charset=utf-8")
      .set("Content-Disposition", `attachment; filename="appointment-${apt.id}.ics"`)
      .send(appointmentToIcs(apt, circle.elderName, deps.now()));
  }));

  r.get("/activity", handle(async (req, res) => {
    const { limit } = parse(limitQuery(30, 100), req.query);
    res.json({ activity: await listActivity(deps, session(res).circle.id, limit) });
  }));
  r.get("/notifications", handle(async (req, res) => {
    const { limit } = parse(limitQuery(20, 100), req.query);
    const notifications = await deps.store.notifications.list(session(res).circle.id, {
      orderBy: { field: "at", direction: "desc" },
      limit,
    });
    res.json({ notifications });
  }));

  return r;
}
