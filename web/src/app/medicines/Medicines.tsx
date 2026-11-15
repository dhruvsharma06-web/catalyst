import { useState } from "react";
import { createMedication, deleteMedication, listMedications, updateMedication } from "../../api/client";
import { todayInZone } from "../../api/datetime";
import { errorMessage } from "../../api/errors";
import { useAction, useAsync } from "../../api/hooks";
import type { Medication, MedicationInput } from "../../api/types";
import { useSession } from "../session";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, PillSwatch, RevealItem, RevealList, Sheet, SkeletonCards, useToast } from "../ui";
import { isLowStock, scheduleSummary } from "../util/format";
import { MedicationForm } from "./MedicationForm";
import { ScanFlow } from "./ScanFlow";

interface EditorState {
  open: boolean;
  medication?: Medication;
}

export function Medicines() {
  const { me } = useSession();
  const toast = useToast();
  const meds = useAsync((s) => listMedications(s), []);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [scanOpen, setScanOpen] = useState(false);
  const [toDelete, setToDelete] = useState<Medication | null>(null);
  const today = todayInZone(me.circle.timezone);

  const saveMedication = async (input: MedicationInput): Promise<void> => {
    const existing = editor.medication;
    if (existing) {
      await updateMedication(existing.id, input);
      toast.notify(`${input.name} updated`);
    } else {
      await createMedication(input);
      toast.notify(`${input.name} added`);
    }
    setEditor((e) => ({ ...e, open: false }));
    meds.reload();
  };

  const toggleActive = useAction(async (m: Medication) => {
    await updateMedication(m.id, { active: !m.active });
    toast.notify(m.active ? `${m.name} paused. No reminders until you resume it.` : `${m.name} resumed`);
    meds.reload();
  });

  const remove = useAction(async (m: Medication) => {
    await deleteMedication(m.id);
    setToDelete(null);
    toast.notify(`${m.name} deleted`);
    meds.reload();
  });

  const list = meds.data ?? [];

  return (
    <div className="hx-screen">
      <header className="hx-pagehead">
        <div>
          <h1>Medicines</h1>
          <p className="hx-lede">Everything {me.circle.elderName} takes, and when.</p>
        </div>
        <div className="hx-pagehead__actions">
          <Button icon="camera" onClick={() => setScanOpen(true)}>
            Scan a prescription
          </Button>
          <Button variant={meds.data && list.length === 0 ? "secondary" : "primary"} icon="plus" onClick={() => setEditor({ open: true })}>
            Add a medicine
          </Button>
        </div>
      </header>

      {meds.loading && !meds.data && <SkeletonCards count={3} />}
      {Boolean(meds.error) && !meds.data && <ErrorState error={meds.error} onRetry={meds.reload} title="We couldn't load the medicines" />}
      {Boolean(toggleActive.error) && (
        <p role="alert" className="hx-form-error">
          {errorMessage(toggleActive.error)}
        </p>
      )}

      {meds.data && list.length === 0 && (
        <EmptyState
          icon="pill"
          title="No medicines yet"
          action={
            <Button variant="primary" size="lg" icon="camera" onClick={() => setScanOpen(true)}>
              Scan a prescription
            </Button>
          }
        >
          Take a photo of a prescription and we'll suggest the schedule, or use "Add a medicine" to type it in yourself.
        </EmptyState>
      )}

      {list.length > 0 && (
        <RevealList>
          {list.map((m, i) => (
            <RevealItem key={m.id} index={i}>
              <Card as="article" interactive className={`hx-med${m.active ? "" : " is-paused"}`} aria-labelledby={`med-${m.id}`}>
                <PillSwatch color={m.color} shape={m.shape} size="lg" />
                <div className="hx-med__body">
                  <h2 id={`med-${m.id}`} className="hx-med__name">
                    {m.name} <span className="hx-dose__dosage">{m.dosage}</span>
                  </h2>
                  <p>{scheduleSummary(m)}</p>
                  {m.instructions && <p className="hx-muted">{m.instructions}</p>}
                  <p className="hx-med__badges">
                    {!m.active && <Badge icon="pause">Paused</Badge>}
                    {m.stock !== null && <Badge tone={isLowStock(m) ? "warning" : "neutral"} icon={isLowStock(m) ? "warning" : "pill"}>{isLowStock(m) ? `Running low: ${m.stock} left` : `${m.stock} left`}</Badge>}
                  </p>
                </div>
                <div className="hx-med__actions">
                  <Button variant="ghost" icon="edit" aria-label={`Edit ${m.name}`} onClick={() => setEditor({ open: true, medication: m })}>
                    Edit
                  </Button>
                  <Button variant="ghost" icon={m.active ? "pause" : "play"} aria-label={`${m.active ? "Pause" : "Resume"} ${m.name}`} onClick={() => void toggleActive.run(m)} disabled={toggleActive.pending}>
                    {m.active ? "Pause" : "Resume"}
                  </Button>
                  <Button variant="ghost" icon="trash" aria-label={`Delete ${m.name}`} onClick={() => setToDelete(m)}>
                    Delete
                  </Button>
                </div>
              </Card>
            </RevealItem>
          ))}
        </RevealList>
      )}

      <Sheet open={editor.open} onClose={() => setEditor((e) => ({ ...e, open: false }))} title={editor.medication ? `Edit ${editor.medication.name}` : "Add a medicine"}>
        <MedicationForm
          initial={editor.medication}
          defaultStartDate={today}
          submitLabel={editor.medication ? "Save changes" : "Add medicine"}
          onSubmit={saveMedication}
          onCancel={() => setEditor((e) => ({ ...e, open: false }))}
        />
      </Sheet>

      <ScanFlow open={scanOpen} startDate={today} onClose={() => setScanOpen(false)} onSaved={meds.reload} />

      <ConfirmDialog
        open={toDelete !== null}
        title={`Delete ${toDelete?.name ?? "this medicine"}?`}
        message="It will be removed from the schedule and from Today. This can't be undone. To stop reminders for a while, pause it instead."
        confirmLabel="Yes, delete"
        pending={remove.pending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        onCancel={() => {
          remove.clearError();
          setToDelete(null);
        }}
        onConfirm={() => toDelete && void remove.run(toDelete)}
      />
    </div>
  );
}
