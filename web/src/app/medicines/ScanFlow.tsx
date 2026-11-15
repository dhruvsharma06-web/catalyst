import { useState } from "react";
import { createMedication, scanPrescription } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { ScanResult } from "../../api/types";
import { Badge, Button, EmptyState, Sheet, Switch, TextField, useToast, PILL_COLORS } from "../ui";
import { percent } from "../util/format";
import { ACCEPTED_TYPES, downscaleToBase64, validateImageFile } from "./image";
import { DaysPicker, TimesEditor } from "./pickers";
import { emptyMedication, toMedicationInput, validateMedication, type Errors, type MedFormValues } from "./validation";

interface Draft {
  key: number;
  selected: boolean;
  values: MedFormValues;
  errors: Errors;
  saveError?: string;
}

interface Props {
  open: boolean;
  startDate: string;
  onClose: () => void;
  onSaved: () => void;
}

/** Photo -> drafts -> review. Nothing is saved until the person confirms. */
export function ScanFlow({ open, startDate, onClose, onSaved }: Props) {
  return (
    <Sheet open={open} onClose={onClose} title="Scan a prescription" description="Take or choose a clear photo. We'll suggest a schedule for you to check.">
      <ScanBody startDate={startDate} onClose={onClose} onSaved={onSaved} />
    </Sheet>
  );
}

function ScanBody({ startDate, onClose, onSaved }: Omit<Props, "open">) {
  const toast = useToast();
  const [fileError, setFileError] = useState<string>();
  const [result, setResult] = useState<ScanResult>();
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [lastFile, setLastFile] = useState<File>();

  const scan = useAction(async (file: File) => {
    const image = await downscaleToBase64(file);
    const res = await scanPrescription(image);
    setResult(res);
    setDrafts(
      res.medications.map((m, i) => ({
        key: i,
        selected: true,
        errors: {},
        values: {
          ...emptyMedication(startDate),
          name: m.name,
          dosage: m.dosage,
          instructions: m.instructions,
          times: m.times,
          daysOfWeek: m.daysOfWeek,
          color: PILL_COLORS[(i + 1) % PILL_COLORS.length] ?? "white",
        },
      })),
    );
  });

  const onPick = (file: File | undefined): void => {
    if (!file) return;
    const problem = validateImageFile(file);
    setFileError(problem ?? undefined);
    if (problem) return;
    setLastFile(file);
    void scan.run(file);
  };

  const update = (key: number, patch: Partial<Draft>): void =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)));
  const updateValues = (key: number, patch: Partial<MedFormValues>): void =>
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, values: { ...d.values, ...patch } } : d)));

  const save = useAction(async () => {
    const chosen = drafts.filter((d) => d.selected);
    const checked = chosen.map((d) => ({ ...d, errors: validateMedication(d.values) }));
    setDrafts((prev) => prev.map((d) => checked.find((c) => c.key === d.key) ?? d));
    if (checked.some((d) => Object.keys(d.errors).length > 0)) throw new Error("Please fix the highlighted medicines.");

    let added = 0;
    for (const d of checked) {
      try {
        await createMedication(toMedicationInput(d.values));
        added++;
        update(d.key, { selected: false, saveError: undefined });
      } catch (e) {
        update(d.key, { saveError: errorMessage(e) });
      }
    }
    if (added > 0) {
      onSaved();
      toast.notify(added === 1 ? "1 medicine added" : `${added} medicines added`);
    }
    if (added < checked.length) throw new Error("Some medicines could not be saved. They are still selected so you can try again.");
    onClose();
  });

  if (!result) {
    return (
      <div className="hx-scan">
        <p className="hx-callout-plain">Always check against the original prescription.</p>
        <label className="hx-btn hx-btn--primary hx-btn--lg hx-filebtn">
          <input
            type="file"
            accept={ACCEPTED_TYPES.join(",")}
            className="visually-hidden"
            disabled={scan.pending}
            onChange={(e) => {
              onPick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
          <span>{scan.pending ? "Reading your photo…" : "Choose or take a photo"}</span>
        </label>
        <p className="hx-field__hint">JPEG, PNG or WebP, up to 5 MB.</p>
        <p role="status" className="hx-scan__status">
          {scan.pending && "Reading the prescription. This takes a few seconds."}
        </p>
        {(fileError !== undefined || Boolean(scan.error)) && (
          <p role="alert" className="hx-form-error">
            {fileError ?? errorMessage(scan.error)}
          </p>
        )}
        {Boolean(scan.error) && lastFile && (
          <Button onClick={() => void scan.run(lastFile)}>Try again</Button>
        )}
      </div>
    );
  }

  if (result.medications.length === 0) {
    return (
      <EmptyState icon="camera" title="We couldn't find any medicines" action={<Button onClick={() => setResult(undefined)}>Try another photo</Button>}>
        {result.notes || "Make sure the whole label is in the photo and well lit."}
      </EmptyState>
    );
  }

  const selectedCount = drafts.filter((d) => d.selected).length;
  return (
    <div className="hx-scan">
      <p className="hx-callout-plain">Always check against the original prescription.</p>
      <p>
        <Badge tone={result.confidence < 0.6 ? "warning" : "info"}>Confidence {percent(result.confidence)}</Badge>{" "}
        {result.model_version === "mock" && <Badge>Sample result</Badge>}
      </p>
      {result.notes && <p className="hx-muted">{result.notes}</p>}
      <ul className="hx-drafts">
        {drafts.map((d) => (
          <li key={d.key} className="hx-card hx-draft">
            <Switch label={`Add ${d.values.name || "this medicine"}`} checked={d.selected} onChange={(e) => update(d.key, { selected: e.target.checked })} />
            <fieldset className="hx-fieldset" disabled={!d.selected}>
              <legend className="visually-hidden">Details for {d.values.name || "medicine"}</legend>
              <TextField label="Medicine name" value={d.values.name} error={d.errors["name"]} onChange={(e) => updateValues(d.key, { name: e.target.value })} />
              <TextField label="Dose" value={d.values.dosage} error={d.errors["dosage"]} onChange={(e) => updateValues(d.key, { dosage: e.target.value })} />
              <TextField label="How to take it" optional value={d.values.instructions} error={d.errors["instructions"]} onChange={(e) => updateValues(d.key, { instructions: e.target.value })} />
              <TimesEditor times={d.values.times} error={d.errors["times"]} onChange={(times) => updateValues(d.key, { times })} />
              <DaysPicker days={d.values.daysOfWeek} error={d.errors["daysOfWeek"]} onChange={(daysOfWeek) => updateValues(d.key, { daysOfWeek })} />
            </fieldset>
            {d.saveError && (
              <p role="alert" className="hx-form-error">
                {d.saveError}
              </p>
            )}
          </li>
        ))}
      </ul>
      {save.error instanceof Error && (
        <p role="alert" className="hx-form-error">
          {save.error.message}
        </p>
      )}
      <div className="hx-form__actions">
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" disabled={selectedCount === 0} loading={save.pending} onClick={() => void save.run()}>
          {`Add selected (${selectedCount})`}
        </Button>
      </div>
    </div>
  );
}
