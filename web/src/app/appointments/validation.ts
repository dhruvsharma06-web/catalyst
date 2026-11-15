import type { Appointment, AppointmentInput } from "../../api/types";
import { zonedLocalToUtcIso, zonedParts } from "../../api/datetime";

export type Errors = Record<string, string>;
export type ReminderChoice = "60" | "1440" | "2880" | "custom";

export interface AppointmentFormValues {
  doctorName: string;
  specialty: string;
  location: string;
  date: string;
  time: string;
  duration: string;
  reminder: ReminderChoice;
  customReminder: string; // minutes
  notes: string;
}

export const emptyAppointment = (date: string): AppointmentFormValues => ({
  doctorName: "",
  specialty: "",
  location: "",
  date,
  time: "10:00",
  duration: "30",
  reminder: "1440",
  customReminder: "",
  notes: "",
});

export function fromAppointment(a: Appointment, timeZone: string): AppointmentFormValues {
  const { date, time } = zonedParts(a.startsAt, timeZone);
  const preset = (["60", "1440", "2880"] as const).find((p) => Number(p) === a.reminderMinutesBefore);
  return {
    doctorName: a.doctorName,
    specialty: a.specialty,
    location: a.location,
    date,
    time,
    duration: String(a.durationMinutes),
    reminder: preset ?? "custom",
    customReminder: preset ? "" : String(a.reminderMinutesBefore),
    notes: a.notes,
  };
}

const reminderMinutes = (v: AppointmentFormValues): number => (v.reminder === "custom" ? Number(v.customReminder) : Number(v.reminder));

export function validateAppointment(v: AppointmentFormValues): Errors {
  const e: Errors = {};
  if (!v.doctorName.trim()) e["doctorName"] = "Please enter who the appointment is with.";
  else if (v.doctorName.trim().length > 80) e["doctorName"] = "Use 80 characters or fewer.";
  if (!v.date) e["date"] = "Choose a date.";
  if (!v.time) e["time"] = "Choose a time.";
  const d = Number(v.duration);
  if (v.duration.trim() === "" || !Number.isInteger(d) || d < 5 || d > 480) e["durationMinutes"] = "Enter a length between 5 and 480 minutes.";
  if (v.reminder === "custom") {
    const r = Number(v.customReminder);
    if (v.customReminder.trim() === "" || !Number.isInteger(r) || r < 0 || r > 10080) e["reminderMinutesBefore"] = "Enter minutes between 0 and 10080 (one week).";
  }
  if (v.notes.length > 1000) e["notes"] = "Use 1000 characters or fewer.";
  return e;
}

/** Local date/time are in the circle's time zone; the contract wants ISO UTC. */
export function toAppointmentInput(v: AppointmentFormValues, timeZone: string): AppointmentInput {
  return {
    doctorName: v.doctorName.trim(),
    specialty: v.specialty.trim(),
    location: v.location.trim(),
    startsAt: zonedLocalToUtcIso(v.date, v.time, timeZone),
    durationMinutes: Number(v.duration),
    notes: v.notes.trim(),
    reminderMinutesBefore: reminderMinutes(v),
  };
}
