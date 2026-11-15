import { useState, type FormEvent } from "react";
import { errorMessage, fieldErrors } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { Appointment, AppointmentInput } from "../../api/types";
import { Button, Field, SelectField, TextField } from "../ui";
import {
  emptyAppointment,
  fromAppointment,
  toAppointmentInput,
  validateAppointment,
  type AppointmentFormValues,
  type Errors,
  type ReminderChoice,
} from "./validation";

interface Props {
  initial?: Appointment;
  timeZone: string;
  defaultDate: string;
  submitLabel: string;
  onSubmit: (input: AppointmentInput) => Promise<void>;
  onCancel: () => void;
}

export function AppointmentForm({ initial, timeZone, defaultDate, submitLabel, onSubmit, onCancel }: Props) {
  const [v, setV] = useState<AppointmentFormValues>(() => (initial ? fromAppointment(initial, timeZone) : emptyAppointment(defaultDate)));
  const [errors, setErrors] = useState<Errors>({});
  const save = useAction(onSubmit);
  const set = <K extends keyof AppointmentFormValues>(k: K, val: AppointmentFormValues[K]): void => setV((p) => ({ ...p, [k]: val }));

  const handle = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateAppointment(v);
    setErrors(found);
    if (Object.keys(found).length === 0) await save.run(toAppointmentInput(v, timeZone));
  };

  const server = save.error ? fieldErrors(save.error) : {};
  const err = (k: string): string | undefined => errors[k] ?? server[k];
  const general = save.error && Object.keys(server).length === 0 ? errorMessage(save.error) : undefined;

  return (
    <form className="hx-form" onSubmit={(e) => void handle(e)} noValidate>
      <TextField label="Who is it with?" value={v.doctorName} onChange={(e) => set("doctorName", e.target.value)} error={err("doctorName")} hint="For example Dr. Rao." maxLength={80} autoComplete="off" required />
      <TextField label="Type of doctor" optional value={v.specialty} onChange={(e) => set("specialty", e.target.value)} error={err("specialty")} hint="For example heart doctor, or Cardiology." maxLength={80} autoComplete="off" />
      <TextField label="Where" optional value={v.location} onChange={(e) => set("location", e.target.value)} error={err("location")} maxLength={200} autoComplete="off" />
      <div className="hx-form__row">
        <TextField label="Date" type="date" value={v.date} onChange={(e) => set("date", e.target.value)} error={err("date") ?? err("startsAt")} required />
        <TextField label="Time" type="time" value={v.time} onChange={(e) => set("time", e.target.value)} error={err("time")} required />
      </div>
      <p className="hx-field__hint">Times are in the circle's time zone ({timeZone}).</p>
      <TextField label="How long (minutes)" type="number" inputMode="numeric" min={5} max={480} value={v.duration} onChange={(e) => set("duration", e.target.value)} error={err("durationMinutes")} />
      <SelectField label="Remind us" value={v.reminder} onChange={(e) => set("reminder", e.target.value as ReminderChoice)} error={err("reminderMinutesBefore") && v.reminder !== "custom" ? err("reminderMinutesBefore") : undefined}>
        <option value="60">1 hour before</option>
        <option value="1440">1 day before</option>
        <option value="2880">2 days before</option>
        <option value="custom">Another time…</option>
      </SelectField>
      {v.reminder === "custom" && (
        <TextField label="Remind us this many minutes before" type="number" inputMode="numeric" min={0} max={10080} value={v.customReminder} onChange={(e) => set("customReminder", e.target.value)} error={err("reminderMinutesBefore")} />
      )}
      <Field label="Notes" optional error={err("notes")}>
        {(a11y) => <textarea {...a11y} className="hx-input hx-textarea" rows={3} maxLength={1000} value={v.notes} onChange={(e) => set("notes", e.target.value)} />}
      </Field>
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
