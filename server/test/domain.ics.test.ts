import { describe, expect, it } from "vitest";
import { appointmentToIcs } from "../src/domain/ics.js";
import type { Appointment } from "../src/domain/types.js";

const NOW = new Date("2026-11-15T06:30:00Z");

function apt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "apt_123",
    doctorName: "Dr. Rao",
    specialty: "Cardiology",
    location: "City Hospital, Block B",
    startsAt: "2026-11-20T04:30:00.000Z",
    durationMinutes: 45,
    notes: "Bring reports",
    reminderMinutesBefore: 60,
    createdBy: "Ananya",
    updatedAt: "2026-11-15T00:00:00.000Z",
    ...overrides,
  };
}

/** Undoes RFC 5545 line folding so content can be asserted on logical lines. */
const unfold = (ics: string) => ics.replace(/\r\n[ \t]/g, "");
const logicalLines = (ics: string) => unfold(ics).split("\r\n").filter(Boolean);
const field = (ics: string, name: string) => logicalLines(ics).find((l) => l.startsWith(`${name}:`));

describe("appointmentToIcs", () => {
  it("produces a VCALENDAR containing exactly one VEVENT", () => {
    const lines = logicalLines(appointmentToIcs(apt(), "Kamala", NOW));
    expect(lines[0]).toBe("BEGIN:VCALENDAR");
    expect(lines.at(-1)).toBe("END:VCALENDAR");
    expect(lines).toContain("VERSION:2.0");
    expect(lines.filter((l) => l === "BEGIN:VEVENT")).toHaveLength(1);
    expect(lines.filter((l) => l === "END:VEVENT")).toHaveLength(1);
    expect(lines).toContain("UID:apt_123@hearth");
  });

  it("uses CRLF line endings throughout and ends with one", () => {
    const ics = appointmentToIcs(apt(), "Kamala", NOW);
    expect(ics.endsWith("\r\n")).toBe(true);
    expect(ics.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);
  });

  it("formats times as UTC basic-format timestamps", () => {
    const ics = appointmentToIcs(apt(), "Kamala", NOW);
    expect(field(ics, "DTSTAMP")).toBe("DTSTAMP:20261115T063000Z");
    expect(field(ics, "DTSTART")).toBe("DTSTART:20261120T043000Z");
  });

  it("sets DTEND to the start plus the duration", () => {
    const ics = appointmentToIcs(apt({ durationMinutes: 45 }), "Kamala", NOW);
    expect(field(ics, "DTEND")).toBe("DTEND:20261120T051500Z");
  });

  it("rolls DTEND over midnight", () => {
    const ics = appointmentToIcs(apt({ startsAt: "2026-11-20T23:30:00.000Z", durationMinutes: 60 }), "Kamala", NOW);
    expect(field(ics, "DTEND")).toBe("DTEND:20261121T003000Z");
  });

  it("titles the event with the elder, doctor and specialty", () => {
    const ics = appointmentToIcs(apt(), "Kamala", NOW);
    expect(field(ics, "SUMMARY")).toBe("SUMMARY:Kamala: Dr. Rao (Cardiology)");
  });

  it("omits the specialty brackets when there is none", () => {
    const ics = appointmentToIcs(apt({ specialty: "" }), "Kamala", NOW);
    expect(field(ics, "SUMMARY")).toBe("SUMMARY:Kamala: Dr. Rao");
  });

  it("escapes commas, backslashes and newlines in text values", () => {
    const ics = appointmentToIcs(apt({ location: "Room 4, Wing A", notes: "line one\nline two\r\nC:\\path" }), "Kamala", NOW);
    expect(field(ics, "LOCATION")).toBe("LOCATION:Room 4\\, Wing A");
    expect(field(ics, "DESCRIPTION")).toBe("DESCRIPTION:line one\\nline two\\nC:\\\\path");
  });

  it("adds a display alarm using the reminder lead time", () => {
    const lines = logicalLines(appointmentToIcs(apt({ reminderMinutesBefore: 90 }), "Kamala", NOW));
    expect(lines).toContain("BEGIN:VALARM");
    expect(lines).toContain("TRIGGER:-PT90M");
  });

  it("folds long lines so no physical line exceeds 75 octets", () => {
    const ics = appointmentToIcs(apt({ notes: "n".repeat(400), location: "L".repeat(200) }), "Kamala", NOW);
    for (const physical of ics.split("\r\n")) {
      expect(Buffer.byteLength(physical)).toBeLessThanOrEqual(75);
    }
    // Folding must be lossless.
    expect(field(ics, "DESCRIPTION")).toBe(`DESCRIPTION:${"n".repeat(400)}`);
  });
});
