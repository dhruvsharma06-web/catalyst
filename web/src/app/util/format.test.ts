import { describe, expect, it } from "vitest";
import type { Appointment } from "../../api/types";
import { googleCalendarUrl } from "./calendar";
import { daysSummary, isLowStock, partOfDay, reminderLabel } from "./format";

describe("format helpers", () => {
  it("groups times into parts of the day", () => {
    expect(partOfDay("06:30")).toBe("Morning");
    expect(partOfDay("13:00")).toBe("Afternoon");
    expect(partOfDay("20:00")).toBe("Evening");
    expect(partOfDay("22:15")).toBe("Night");
  });

  it("summarises days", () => {
    expect(daysSummary([0, 1, 2, 3, 4, 5, 6])).toBe("Every day");
    expect(daysSummary([4, 1])).toBe("Mon, Thu");
  });

  it("flags low stock only when both numbers are known", () => {
    expect(isLowStock({ stock: 5, refillAt: 7 })).toBe(true);
    expect(isLowStock({ stock: 8, refillAt: 7 })).toBe(false);
    expect(isLowStock({ stock: null, refillAt: 7 })).toBe(false);
  });

  it("labels reminders", () => {
    expect(reminderLabel(1440)).toBe("1 day before");
    expect(reminderLabel(180)).toBe("3 hours before");
  });
});

describe("googleCalendarUrl", () => {
  it("encodes title, UTC dates, details and location", () => {
    const apt: Appointment = {
      id: "a1", doctorName: "Dr. Rao", specialty: "Cardiology", location: "Pune", startsAt: "2026-11-18T05:00:00.000Z",
      durationMinutes: 30, notes: "Bring reports", reminderMinutesBefore: 60, createdBy: "m1", updatedAt: "2026-11-15T00:00:00.000Z",
    };
    const url = new URL(googleCalendarUrl(apt));
    expect(url.origin + url.pathname).toBe("https://calendar.google.com/calendar/render");
    expect(url.searchParams.get("action")).toBe("TEMPLATE");
    expect(url.searchParams.get("text")).toBe("Cardiology: Dr. Rao");
    expect(url.searchParams.get("dates")).toBe("20261118T050000Z/20261118T053000Z");
    expect(url.searchParams.get("details")).toBe("Bring reports");
    expect(url.searchParams.get("location")).toBe("Pune");
  });
});
