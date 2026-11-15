import { DateTime } from "luxon";
import { maskEmail } from "../adapters/mailer.js";
import { newId } from "../domain/ids.js";
import { addDays, dosesForDate, todayIn } from "../domain/schedule.js";
import type { Circle, Dose, Member, Notification, NotificationKind, NotifyPrefs } from "../domain/types.js";
import type { Deps } from "../services/deps.js";
import { publicCircle } from "../services/circle.js";
import { renderEmail } from "./templates.js";

/** Send an "upcoming dose" email this many minutes before the dose. */
export const UPCOMING_LEAD_MIN = 15;
/** Missed-dose alerts are only sent for doses missed within this window, to avoid a flood after downtime. */
const MISSED_LOOKBACK_HOURS = 12;

export interface ReminderEvent {
  key: string;
  kind: NotificationKind;
  pref: keyof NotifyPrefs;
  subject: string;
  lines: string[];
}

export interface ReminderRunResult {
  circles: number;
  sent: number;
  skipped: number;
}

const PREF_BY_KIND: Record<NotificationKind, keyof NotifyPrefs> = {
  dose_upcoming: "doses",
  dose_missed: "missed",
  appointment_upcoming: "appointments",
  refill_low: "doses",
};

/** Decides which reminder events are due for one circle right now. Pure apart from reads. */
export async function collectEvents(deps: Deps, circle: Circle): Promise<ReminderEvent[]> {
  const now = DateTime.fromJSDate(deps.now()).toUTC();
  const zone = circle.timezone;
  const today = todayIn(zone, deps.now());
  const yesterday = addDays(today, -1);
  const first = circle.elderName.split(/\s+/)[0] ?? circle.elderName;

  const [meds, logs, appointments] = await Promise.all([
    deps.store.medications.list(circle.id),
    deps.store.doseLogs.list(circle.id, { where: [{ field: "date", op: ">=", value: yesterday }] }),
    deps.store.appointments.list(circle.id, { where: [{ field: "startsAt", op: ">=", value: now.toISO()! }] }),
  ]);
  const logMap = new Map(logs.map((l) => [l.id, l]));
  const doses: Dose[] = [yesterday, today].flatMap((d) => dosesForDate(meds, logMap, d, zone, deps.now()));
  const events: ReminderEvent[] = [];

  for (const dose of doses) {
    const at = DateTime.fromISO(dose.scheduledAt);
    const minutesUntil = at.diff(now, "minutes").minutes;
    const local = at.setZone(zone).toFormat("h:mm a");
    if ((dose.status === "upcoming" || dose.status === "due") && minutesUntil > 0 && minutesUntil <= UPCOMING_LEAD_MIN) {
      events.push({
        key: `dose_upcoming:${dose.id}`,
        kind: "dose_upcoming",
        pref: "doses",
        subject: `Reminder: ${first}'s ${dose.name} ${dose.dosage} at ${local}`,
        lines: [`It's almost time for ${first}'s ${dose.name} (${dose.dosage}) at ${local}.`, "Tap “Taken” in Hearth once it's done."],
      });
    }
    if (dose.status === "missed" && now.diff(at, "hours").hours <= MISSED_LOOKBACK_HOURS) {
      events.push({
        key: `dose_missed:${dose.id}`,
        kind: "dose_missed",
        pref: "missed",
        subject: `Missed dose: ${first}'s ${dose.name} (${local})`,
        lines: [
          `${first}'s ${dose.name} (${dose.dosage}) scheduled for ${local} hasn't been marked as taken.`,
          "A quick call to check in may help. If it was taken, it can still be marked in Hearth.",
        ],
      });
    }
  }

  for (const apt of appointments) {
    const start = DateTime.fromISO(apt.startsAt);
    const minutesUntil = start.diff(now, "minutes").minutes;
    if (minutesUntil > 0 && minutesUntil <= apt.reminderMinutesBefore) {
      const when = start.setZone(zone).toFormat("cccc d LLLL 'at' h:mm a");
      events.push({
        key: `appointment_upcoming:${apt.id}:${apt.startsAt}`,
        kind: "appointment_upcoming",
        pref: "appointments",
        subject: `Upcoming visit: ${first} with ${apt.doctorName}, ${start.setZone(zone).toFormat("d LLL, h:mm a")}`,
        lines: [
          `${first} has an appointment with ${apt.doctorName}${apt.specialty ? ` (${apt.specialty})` : ""} on ${when}.`,
          ...(apt.location ? [`Where: ${apt.location}`] : []),
          ...(apt.notes ? [`Notes: ${apt.notes}`] : []),
        ],
      });
    }
  }

  for (const med of meds) {
    if (!med.active || med.stock === null || med.refillAt === null || med.stock > med.refillAt) continue;
    events.push({
      key: `refill_low:${med.id}:${today}`,
      kind: "refill_low",
      pref: PREF_BY_KIND.refill_low,
      subject: `Refill soon: ${first}'s ${med.name} (${med.stock} left)`,
      lines: [`Only ${med.stock} ${med.name} ${med.stock === 1 ? "dose is" : "doses are"} left. Please arrange a refill.`],
    });
  }
  return events;
}

/** Sends one reminder email and records it in the circle's notification history. */
async function deliver(deps: Deps, circle: Circle, event: ReminderEvent, member: Member): Promise<void> {
  const to = member.email;
  if (!to) return;
  const email = renderEmail({ appUrl: deps.config.APP_URL, greetingName: member.name, subject: event.subject, lines: event.lines });
  await deps.mailer.send({ to, ...email });
  const record: Notification = {
    id: newId("ntf"),
    at: deps.now().toISOString(),
    kind: event.kind,
    toMasked: maskEmail(to),
    subject: event.subject,
    transport: deps.mailer.transport,
  };
  await deps.store.notifications.put(circle.id, record);
}

/**
 * Runs one reminder sweep across all circles. Safe to call every few minutes:
 * each event is claimed exactly once, and released again if delivery fails so the next run retries.
 */
export async function runReminders(deps: Deps): Promise<ReminderRunResult> {
  const ids = await deps.store.circles.listIds();
  const result: ReminderRunResult = { circles: ids.length, sent: 0, skipped: 0 };

  for (const id of ids) {
    const record = await deps.store.circles.get(id);
    if (!record) continue;
    const circle = publicCircle(record);
    try {
      const [events, members] = await Promise.all([collectEvents(deps, circle), deps.store.members.list(id)]);
      for (const event of events) {
        const recipients = members.filter((m) => m.email && m.notify[event.pref]);
        if (recipients.length === 0) {
          result.skipped += 1;
          continue;
        }
        // Claimed per recipient, so a failure for one person never re-sends to the others.
        for (const member of recipients) {
          const key = `${event.key}:${member.id}`;
          if (!(await deps.store.claimReminder(id, key))) {
            result.skipped += 1;
            continue;
          }
          try {
            await deliver(deps, circle, event, member);
            result.sent += 1;
          } catch (err) {
            await deps.store.releaseReminder(id, key);
            deps.logger.error({ circleId: id, kind: event.kind, err: (err as Error).message }, "reminder delivery failed");
          }
        }
      }
    } catch (err) {
      // One broken circle must never stop reminders for everyone else.
      deps.logger.error({ circleId: id, err: (err as Error).message }, "reminder sweep failed for circle");
    }
  }
  return result;
}
