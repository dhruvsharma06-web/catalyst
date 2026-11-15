import { useState, type FormEvent } from "react";
import { errorMessage, fieldErrors } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { Medication, MedicationInput } from "../../api/types";
import { Button, TextField } from "../ui";
import { DaysPicker, PillPicker, TimesEditor } from "./pickers";
import {
  emptyMedication,
  fromMedication,
  toMedicationInput,
  validateMedication,
  type Errors,
  type MedFormValues,
} from "./validation";

interface Props {
  initial?: Medication;
  defaultStartDate: string;
  submitLabel: string;
  onSubmit: (input: MedicationInput) => Promise<void>;
  onCancel: () => void;
}

const MORE_FIELDS = ["startDate", "endDate", "stock", "refillAt"];

export function MedicationForm({ initial, defaultStartDate, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<MedFormValues>(() => (initial ? fromMedication(initial) : emptyMedication(defaultStartDate)));
  const [errors, setErrors] = useState<Errors>({});
  const [moreOpen, setMoreOpen] = useState<boolean>(() => Boolean(initial && (initial.endDate || initial.stock !== null || initial.refillAt !== null)));
  const save = useAction(onSubmit);
  const set = <K extends keyof MedFormValues>(k: K, val: MedFormValues[K]): void => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateMedication(v);
    setErrors(found);
    if (MORE_FIELDS.some((f) => found[f])) setMoreOpen(true);
    if (Object.keys(found).length === 0) await save.run(toMedicationInput(v));
  };

  const server = save.error ? fieldErrors(save.error) : {};
  const err = (k: string): string | undefined => errors[k] ?? server[k];
  const general = save.error && Object.keys(server).length === 0 ? errorMessage(save.error) : undefined;

  return (
    <form className="hx-form" onSubmit={(e) => void handle(e)} noValidate>
      <TextField label="Medicine name" value={v.name} onChange={(e) => set("name", e.target.value)} error={err("name")} maxLength={80} autoComplete="off" required />
      <TextField label="Dose" value={v.dosage} onChange={(e) => set("dosage", e.target.value)} error={err("dosage")} hint="For example 500 mg, or 1 tablet." maxLength={60} autoComplete="off" required />
      <TextField label="How to take it" optional value={v.instructions} onChange={(e) => set("instructions", e.target.value)} error={err("instructions")} hint="For example: with food." maxLength={300} autoComplete="off" />
      <TimesEditor times={v.times} onChange={(t) => set("times", t)} error={err("times")} />
      <DaysPicker days={v.daysOfWeek} onChange={(d) => set("daysOfWeek", d)} error={err("daysOfWeek")} />
      <PillPicker color={v.color} shape={v.shape} onColor={(c) => set("color", c)} onShape={(s) => set("shape", s)} />

      <details className="hx-more" open={moreOpen} onToggle={(e) => setMoreOpen(e.currentTarget.open)}>
        <summary>More options</summary>
        <div className="hx-form">
          <TextField label="Start date" type="date" value={v.startDate} onChange={(e) => set("startDate", e.target.value)} error={err("startDate")} />
          <TextField label="Stop date" optional type="date" value={v.endDate} onChange={(e) => set("endDate", e.target.value)} error={err("endDate")} hint="Leave empty if it continues." />
          <TextField label="Pills left" optional type="number" inputMode="numeric" min={0} value={v.stock} onChange={(e) => set("stock", e.target.value)} error={err("stock")} />
          <TextField label="Warn me when this many are left" optional type="number" inputMode="numeric" min={0} value={v.refillAt} onChange={(e) => set("refillAt", e.target.value)} error={err("refillAt")} hint="We'll flag the medicine and email a reminder to refill." />
        </div>
      </details>

      {general && (
        <p role="alert" className="hx-form-error">
          {general}
        </p>
      )}
      <div className="hx-form__actions">
        <Button onClick={onCancel}>Cancel</Button>
        <Button type="submit" variant="primary" loading={save.pending}>
          {save.pending ? "Saving…" : submitLabel}
        </Button>
      </div>
    </form>
  );
}
