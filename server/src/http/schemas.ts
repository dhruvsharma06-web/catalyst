import { IANAZone } from "luxon";
import { z } from "zod";
import { PILL_COLORS, PILL_SHAPES, ROLES } from "../domain/types.js";

// Control characters are never valid in single-line fields (and would allow email header injection).
const CONTROL_CHARS = /\p{Cc}/u;
const trimmed = (min: number, max: number) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((s) => !CONTROL_CHARS.test(s), "Use a single line of text");
const name = trimmed(1, 60);
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use 24-hour HH:mm");
const date = z.iso.date();
const email = z.email().max(254).toLowerCase().nullable();
const passcode = z.string().min(6, "Use at least 6 characters").max(64);

export const timezone = z.string().refine((tz) => IANAZone.isValidZone(tz), "Unknown time zone");

const notify = z.object({ doses: z.boolean(), missed: z.boolean(), appointments: z.boolean() }).strict();

const password = z.string().min(10, "Use at least 10 characters").max(128);
const requiredEmail = z.email("Enter a valid email address").max(254).toLowerCase();

export const signupSchema = z.object({ name, email: requiredEmail, password }).strict();
export const loginSchema = z.object({ email: requiredEmail, password: z.string().min(1).max(128) }).strict();

export const createCircleSchema = z.object({ elderName: name, timezone, passcode, role: z.enum(ROLES) }).strict();

export const joinSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z]{3,10}-\d{4}$/, "Codes look like MAPLE-4821"),
    passcode: z.string().min(1).max(64),
    role: z.enum(ROLES),
  })
  .strict();

export const activeCircleSchema = z.object({ circleId: z.string().min(1).max(64) }).strict();

export const updateMeSchema = z.object({ email: email.optional(), notify: notify.optional() }).strict();

export const changePasscodeSchema = z.object({ currentPasscode: z.string().min(1).max(64), newPasscode: passcode }).strict();

const medicationFields = {
  name: trimmed(1, 80),
  dosage: trimmed(1, 60),
  instructions: z.string().trim().max(300),
  times: z
    .array(time)
    .min(1, "Add at least one time")
    .max(8)
    .refine((t) => new Set(t).size === t.length, "Times must be different")
    .transform((t) => [...t].sort()),
  daysOfWeek: z
    .array(z.number().int().min(0).max(6))
    .min(1, "Pick at least one day")
    .max(7)
    .refine((d) => new Set(d).size === d.length, "Days must be different")
    .transform((d) => [...d].sort((a, b) => a - b)),
  startDate: date,
  endDate: date.nullable(),
  stock: z.number().int().min(0).max(10000).nullable(),
  refillAt: z.number().int().min(0).max(10000).nullable(),
  color: z.enum(PILL_COLORS),
  shape: z.enum(PILL_SHAPES),
};

const endAfterStart = (m: { startDate?: string; endDate?: string | null }) =>
  !m.startDate || !m.endDate || m.endDate >= m.startDate;

export const createMedicationSchema = z
  .object(medicationFields)
  .strict()
  .refine(endAfterStart, { message: "End date must be on or after the start date", path: ["endDate"] });

export const updateMedicationSchema = z
  .object({ ...medicationFields, active: z.boolean() })
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const logDoseSchema = z.object({ status: z.enum(["taken", "skipped"]) }).strict();

const appointmentFields = {
  doctorName: trimmed(1, 80),
  specialty: z.string().trim().max(80),
  location: z.string().trim().max(160),
  startsAt: z.iso.datetime({ offset: true }).transform((s) => new Date(s).toISOString()),
  durationMinutes: z.number().int().min(5).max(480),
  notes: z.string().trim().max(500),
  reminderMinutesBefore: z.number().int().min(0).max(10080),
};

export const createAppointmentSchema = z.object(appointmentFields).strict();
export const updateAppointmentSchema = z
  .object(appointmentFields)
  .partial()
  .strict()
  .refine((v) => Object.keys(v).length > 0, "Nothing to update");

export const scanSchema = z
  .object({
    imageBase64: z
      .string()
      .min(16)
      .max(7_000_000)
      .regex(/^[A-Za-z0-9+/]+={0,2}$/, "Image must be base64 encoded"),
    mimeType: z.enum(["image/jpeg", "image/png", "image/webp"]),
  })
  .strict();

export const dateQuery = z.object({ date: date.optional() });
export const daysQuery = z.object({ days: z.coerce.number().int().min(1).max(30).default(7) });
export const limitQuery = (def: number, max: number) => z.object({ limit: z.coerce.number().int().min(1).max(max).default(def) });
export const scopeQuery = z.object({ scope: z.enum(["upcoming", "past", "all"]).default("upcoming") });
