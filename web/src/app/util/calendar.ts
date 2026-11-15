import type { Appointment } from "../../api/types";

const compact = (d: Date): string => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/** Pre-filled "add event" link for Google Calendar. */
export function googleCalendarUrl(a: Appointment): string {
  const start = new Date(a.startsAt);
  const end = new Date(start.getTime() + a.durationMinutes * 60_000);
  const title = `${a.specialty ? `${a.specialty}: ` : ""}${a.doctorName}`;
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: title,
    dates: `${compact(start)}/${compact(end)}`,
    details: a.notes,
    location: a.location,
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}
