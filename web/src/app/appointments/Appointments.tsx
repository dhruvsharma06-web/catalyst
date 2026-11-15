import { useState } from "react";
import { appointmentIcsUrl, createAppointment, deleteAppointment, listAppointments, updateAppointment } from "../../api/client";
import { todayInZone } from "../../api/datetime";
import { errorMessage } from "../../api/errors";
import { useAction, useAsync } from "../../api/hooks";
import type { Appointment, AppointmentInput, AppointmentScope } from "../../api/types";
import { useSession } from "../session";
import { Badge, Button, ButtonLink, Card, ConfirmDialog, EmptyState, ErrorState, RevealItem, RevealList, Segmented, Sheet, SkeletonCards, useToast, Icon, panelId, tabId } from "../ui";
import { googleCalendarUrl } from "../util/calendar";
import { formatDateTime, reminderLabel } from "../util/format";
import { AppointmentForm } from "./AppointmentForm";

type Scope = Exclude<AppointmentScope, "all">;
interface EditorState {
  open: boolean;
  appointment?: Appointment;
}

export function Appointments() {
  const { me } = useSession();
  const toast = useToast();
  const tz = me.circle.timezone;
  const [scope, setScope] = useState<Scope>("upcoming");
  const list = useAsync((s) => listAppointments(scope, s), [scope]);
  const [editor, setEditor] = useState<EditorState>({ open: false });
  const [toDelete, setToDelete] = useState<Appointment | null>(null);

  const save = async (input: AppointmentInput): Promise<void> => {
    if (editor.appointment) {
      await updateAppointment(editor.appointment.id, input);
      toast.notify("Appointment updated");
    } else {
      await createAppointment(input);
      toast.notify("Appointment added");
    }
    setEditor((e) => ({ ...e, open: false }));
    list.reload();
  };

  const remove = useAction(async (a: Appointment) => {
    await deleteAppointment(a.id);
    setToDelete(null);
    toast.notify("Appointment deleted");
    list.reload();
  });

  const items = list.data ?? [];

  return (
    <div className="hx-screen">
      <header className="hx-pagehead">
        <div>
          <h1>Appointments</h1>
          <p className="hx-lede">Doctor visits for {me.circle.elderName}, all in one place.</p>
        </div>
        <Button variant="primary" icon="plus" onClick={() => setEditor({ open: true })}>
          Add an appointment
        </Button>
      </header>

      <Segmented
        label="Show appointments"
        mode="tabs"
        idBase="apt"
        value={scope}
        onChange={setScope}
        options={[
          { value: "upcoming", label: "Coming up" },
          { value: "past", label: "Past" },
        ]}
      />

      <div role="tabpanel" id={panelId("apt")} aria-labelledby={tabId("apt", scope)} className="hx-tabpanel">
        {list.loading && !list.data && <SkeletonCards count={2} />}
        {Boolean(list.error) && !list.data && <ErrorState error={list.error} onRetry={list.reload} title="We couldn't load appointments" />}
        {list.data && items.length === 0 && (
          <EmptyState icon="calendar" title={scope === "upcoming" ? "No appointments coming up" : "No past appointments"}>
            {scope === "upcoming" ? 'Choose "Add an appointment" to add the next doctor visit. We\'ll send a reminder before it.' : "Visits will appear here after they have happened."}
          </EmptyState>
        )}
        {items.length > 0 && (
          <RevealList>
            {items.map((a, i) => (
              <RevealItem key={a.id} index={i}>
                <AppointmentCard
                  a={a}
                  tz={tz}
                  onEdit={() => setEditor({ open: true, appointment: a })}
                  onDelete={() => setToDelete(a)}
                />
              </RevealItem>
            ))}
          </RevealList>
        )}
      </div>

      <Sheet open={editor.open} onClose={() => setEditor((e) => ({ ...e, open: false }))} title={editor.appointment ? "Edit appointment" : "Add an appointment"}>
        <AppointmentForm
          initial={editor.appointment}
          timeZone={tz}
          defaultDate={todayInZone(tz)}
          submitLabel={editor.appointment ? "Save changes" : "Add appointment"}
          onSubmit={save}
          onCancel={() => setEditor((e) => ({ ...e, open: false }))}
        />
      </Sheet>

      <ConfirmDialog
        open={toDelete !== null}
        title="Delete this appointment?"
        message={`The visit with ${toDelete?.doctorName ?? "the doctor"} will be removed for everyone in the circle. This can't be undone.`}
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

function AppointmentCard({ a, tz, onEdit, onDelete }: { a: Appointment; tz: string; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card as="article" interactive className="hx-apt" aria-labelledby={`apt-${a.id}`}>
      <h2 id={`apt-${a.id}`} className="hx-apt__who">
        {a.doctorName}
      </h2>
      {a.specialty && <p className="hx-apt__spec">{a.specialty}</p>}
      <p className="hx-apt__when">
        <Icon name="clock" /> {formatDateTime(a.startsAt, tz)} · {a.durationMinutes} min
      </p>
      {a.location && (
        <p>
          <Icon name="pin" /> {a.location}
        </p>
      )}
      {a.notes && <p className="hx-muted">{a.notes}</p>}
      <p>
        <Badge icon="mail">Reminder: {reminderLabel(a.reminderMinutesBefore)}</Badge>
      </p>
      <div className="hx-apt__actions">
        <ButtonLink icon="download" href={appointmentIcsUrl(a.id)} download aria-label={`Add to calendar: visit with ${a.doctorName} (downloads a file)`}>
          Add to calendar
        </ButtonLink>
        <ButtonLink icon="external" href={googleCalendarUrl(a)} target="_blank" rel="noopener noreferrer" aria-label={`Add visit with ${a.doctorName} to Google Calendar (opens in a new tab)`}>
          Google Calendar
        </ButtonLink>
        <Button variant="ghost" icon="edit" aria-label={`Edit visit with ${a.doctorName}`} onClick={onEdit}>
          Edit
        </Button>
        <Button variant="ghost" icon="trash" aria-label={`Delete visit with ${a.doctorName}`} onClick={onDelete}>
          Delete
        </Button>
      </div>
    </Card>
  );
}
