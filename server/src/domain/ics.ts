import type { Appointment } from "./types.js";

/** Escapes text per RFC 5545 §3.3.11. */
function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

const stamp = (iso: string) => iso.replace(/[-:]/g, "").replace(/\.\d{3}/, "");

/**
 * Folds content lines longer than 75 octets (RFC 5545 §3.1). Counts UTF-8 bytes and
 * never splits a character: iterating a string yields whole code points.
 */
function fold(line: string): string {
  const lines: string[] = [];
  let current = "";
  let bytes = 0;
  for (const char of line) {
    const size = Buffer.byteLength(char, "utf8");
    // Continuation lines start with a space, which counts toward their 75 octets.
    if (bytes + size > 75) {
      lines.push(current);
      current = " ";
      bytes = 1;
    }
    current += char;
    bytes += size;
  }
  lines.push(current);
  return lines.join("\r\n");
}

/** Builds a single-event iCalendar file that Google Calendar and Apple Calendar can import. */
export function appointmentToIcs(apt: Appointment, elderName: string, now: Date = new Date()): string {
  const start = new Date(apt.startsAt);
  const end = new Date(start.getTime() + apt.durationMinutes * 60_000);
  const title = `${elderName}: ${apt.doctorName}${apt.specialty ? ` (${apt.specialty})` : ""}`;
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Hearth//Care Circle//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${apt.id}@hearth`,
    `DTSTAMP:${stamp(now.toISOString())}`,
    `DTSTART:${stamp(start.toISOString())}`,
    `DTEND:${stamp(end.toISOString())}`,
    `SUMMARY:${escapeText(title)}`,
    `LOCATION:${escapeText(apt.location)}`,
    `DESCRIPTION:${escapeText(apt.notes)}`,
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${escapeText(title)}`,
    `TRIGGER:-PT${Math.max(apt.reminderMinutesBefore, 0)}M`,
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return `${lines.map(fold).join("\r\n")}\r\n`;
}
