import { describe, expect, it } from "vitest";
import { addDays, todayInZone, zonedLocalToUtcIso, zonedParts } from "./datetime";

describe("zonedLocalToUtcIso", () => {
  it("converts Asia/Kolkata (UTC+5:30) wall time to UTC", () => {
    expect(zonedLocalToUtcIso("2026-11-16", "09:30", "Asia/Kolkata")).toBe("2026-11-16T04:00:00.000Z");
  });

  it("rolls the date back when the zone is ahead of UTC", () => {
    expect(zonedLocalToUtcIso("2026-11-16", "02:00", "Asia/Kolkata")).toBe("2026-11-15T20:30:00.000Z");
  });

  it("handles US daylight and standard time", () => {
    expect(zonedLocalToUtcIso("2026-07-01", "12:00", "America/New_York")).toBe("2026-07-01T16:00:00.000Z");
    expect(zonedLocalToUtcIso("2026-12-01", "12:00", "America/New_York")).toBe("2026-12-01T17:00:00.000Z");
  });

  it("uses the new offset just after a DST change", () => {
    // US clocks spring forward on 2026-03-08 at 02:00 local.
    expect(zonedLocalToUtcIso("2026-03-08", "03:30", "America/New_York")).toBe("2026-03-08T07:30:00.000Z");
  });

  it("round-trips through zonedParts", () => {
    const iso = zonedLocalToUtcIso("2026-11-20", "14:45", "Europe/London");
    expect(zonedParts(iso, "Europe/London")).toMatchObject({ date: "2026-11-20", time: "14:45" });
  });
});

describe("date helpers", () => {
  it("reports today in a zone", () => {
    const now = new Date("2026-11-15T22:00:00Z");
    expect(todayInZone("Asia/Kolkata", now)).toBe("2026-11-16");
    expect(todayInZone("UTC", now)).toBe("2026-11-15");
  });

  it("adds days across month boundaries", () => {
    expect(addDays("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });
});
