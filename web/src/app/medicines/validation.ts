import type { Medication, MedicationInput, PillColor, PillShape } from "../../api/types";
import { ALL_DAYS } from "../util/format";

export type Errors = Record<string, string>;

/** Form-friendly shape: numbers and optional dates are strings until submit. */
export interface MedFormValues {
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
  daysOfWeek: number[];
  startDate: string;
  endDate: string;
  stock: string;
  refillAt: string;
  color: PillColor;
  shape: PillShape;
}

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_COUNT = 100_000;

export const emptyMedication = (startDate: string): MedFormValues => ({
  name: "",
  dosage: "",
  instructions: "",
  times: ["08:00"],
  daysOfWeek: [...ALL_DAYS],
  startDate,
  endDate: "",
  stock: "",
  refillAt: "",
  color: "white",
  shape: "round",
});

export const fromMedication = (m: Medication): MedFormValues => ({
  name: m.name,
  dosage: m.dosage,
  instructions: m.instructions,
  times: [...m.times],
  daysOfWeek: [...m.daysOfWeek],
  startDate: m.startDate,
  endDate: m.endDate ?? "",
  stock: m.stock === null ? "" : String(m.stock),
  refillAt: m.refillAt === null ? "" : String(m.refillAt),
  color: m.color,
  shape: m.shape,
});

function countError(raw: string, label: string): string | undefined {
  if (raw.trim() === "") return undefined;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > MAX_COUNT) return `${label} must be a whole number, 0 or more.`;
  return undefined;
}

/** Mirrors the contract's rules; the server stays authoritative. */
export function validateMedication(v: MedFormValues): Errors {
  const e: Errors = {};
  if (!v.name.trim()) e["name"] = "Please enter the medicine's name.";
  else if (v.name.trim().length > 80) e["name"] = "Use 80 characters or fewer.";
  if (!v.dosage.trim()) e["dosage"] = "Please enter the dose, for example 500 mg.";
  else if (v.dosage.trim().length > 60) e["dosage"] = "Use 60 characters or fewer.";
  if (v.instructions.length > 300) e["instructions"] = "Use 300 characters or fewer.";

  if (v.times.length === 0) e["times"] = "Add at least one time of day.";
  else if (v.times.length > 8) e["times"] = "You can add up to 8 times.";
  else if (v.times.some((t) => !TIME.test(t))) e["times"] = "Fill in every time, or remove the empty ones.";
  else if (new Set(v.times).size !== v.times.length) e["times"] = "Each time can only be listed once.";

  if (v.daysOfWeek.length === 0) e["daysOfWeek"] = "Choose at least one day.";
  if (!DATE.test(v.startDate)) e["startDate"] = "Choose a start date.";
  if (v.endDate && !DATE.test(v.endDate)) e["endDate"] = "Choose a valid end date.";
  else if (v.endDate && DATE.test(v.startDate) && v.endDate < v.startDate) e["endDate"] = "The end date can't be before the start date.";

  const stock = countError(v.stock, "Pills left");
  if (stock) e["stock"] = stock;
  const refill = countError(v.refillAt, "Refill warning");
  if (refill) e["refillAt"] = refill;
  return e;
}

export function toMedicationInput(v: MedFormValues): MedicationInput {
  return {
    name: v.name.trim(),
    dosage: v.dosage.trim(),
    instructions: v.instructions.trim(),
    times: [...new Set(v.times)].sort(),
    daysOfWeek: [...new Set(v.daysOfWeek)].sort((a, b) => a - b),
    startDate: v.startDate,
    endDate: v.endDate || null,
    stock: v.stock.trim() === "" ? null : Number(v.stock),
    refillAt: v.refillAt.trim() === "" ? null : Number(v.refillAt),
    color: v.color,
    shape: v.shape,
  };
}
