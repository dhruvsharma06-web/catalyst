import { DateTime } from "luxon";
import { describe, expect, it } from "vitest";
import {
  addDays,
  dosesForDate,
  doseId,
  isScheduledOn,
  localToUtc,
  parseDoseId,
  statusAt,
  todayIn,
  weekdayOf,
} from "../src/domain/schedule.js";
import type { DoseLog, Medication } from "../src/domain/types.js";

const DAILY = [0, 1, 2, 3, 4, 5, 6];

function med(overrides: Partial<Medication> = {}): Medication {
  return {
    id: "med_abc",
    name: "Metformin",
    dosage: "500 mg",
    instructions: "",
    times: ["08:00"],
    daysOfWeek: DAILY,
    startDate: "2026-11-01",
    endDate: null,
    stock: null,
    refillAt: null,
    color: "white",
    shape: "round",
    active: true,
    createdBy: "Kamala",
    updatedAt: "2026-11-01T00:00:00.000Z",
    ...overrides,
  };
}

describe("dose ids", () => {
  it("builds ids as medicationId_date_HHmm", () => {
    expect(doseId("med_abc", "2026-11-15", "08:05")).toBe("med_abc_2026-11-15_0805");
  });

  it("round-trips ids whose medication id contains underscores", () => {
    const id = doseId("med_some_odd_id", "2026-11-15", "20:30");
    expect(parseDoseId(id)).toEqual({ medicationId: "med_some_odd_id", date: "2026-11-15", time: "20:30" });
  });

  it.each(["", "garbage", "med_2026-11-15", "med_2026-11-15_8", "med_15-11-2026_0800", "_2026-11-15_0800"])(
    "rejects malformed id %j",
    (bad) => {
      expect(parseDoseId(bad)).toBeNull();
    },
  );
});

describe("localToUtc", () => {
  it("converts Asia/Kolkata (UTC+5:30, no DST)", () => {
    expect(localToUtc("2026-11-15", "08:00", "Asia/Kolkata").toISO()).toBe("2026-11-15T02:30:00.000Z");
    expect(localToUtc("2026-11-15", "23:45", "Asia/Kolkata").toISO()).toBe("2026-11-15T18:15:00.000Z");
  });

  it("uses EST before and EDT after the spring-forward change in America/New_York", () => {
    expect(localToUtc("2026-03-07", "12:00", "America/New_York").toISO()).toBe("2026-03-07T17:00:00.000Z");
    expect(localToUtc("2026-03-08", "12:00", "America/New_York").toISO()).toBe("2026-03-08T16:00:00.000Z");
  });

  it("uses EDT before and EST after the fall-back change in America/New_York", () => {
    expect(localToUtc("2026-11-01", "00:30", "America/New_York").toISO()).toBe("2026-11-01T04:30:00.000Z");
    expect(localToUtc("2026-11-01", "12:00", "America/New_York").toISO()).toBe("2026-11-01T17:00:00.000Z");
  });

  it("keeps the local wall-clock time across the DST day", () => {
    const before = localToUtc("2026-03-07", "08:00", "America/New_York");
    const after = localToUtc("2026-03-08", "08:00", "America/New_York");
    // Only 23 real hours separate the two local 08:00s on spring-forward weekend.
    expect(after.diff(before, "hours").hours).toBe(23);
  });
});

describe("date helpers", () => {
  it("todayIn respects the zone", () => {
    const instant = new Date("2026-11-15T20:00:00Z");
    expect(todayIn("Asia/Kolkata", instant)).toBe("2026-11-16");
    expect(todayIn("America/New_York", instant)).toBe("2026-11-15");
  });

  it("addDays crosses month and year boundaries", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("weekdayOf maps Sunday to 0 and Saturday to 6", () => {
    expect(weekdayOf("2026-11-15")).toBe(0);
    expect(weekdayOf("2026-11-16")).toBe(1);
    expect(weekdayOf("2026-11-21")).toBe(6);
  });
});

describe("isScheduledOn", () => {
  it("is false for inactive medications", () => {
    expect(isScheduledOn(med({ active: false }), "2026-11-15")).toBe(false);
  });

  it("is false before the start date and true on it", () => {
    const m = med({ startDate: "2026-11-10" });
    expect(isScheduledOn(m, "2026-11-09")).toBe(false);
    expect(isScheduledOn(m, "2026-11-10")).toBe(true);
  });

  it("is false after the end date and true on it", () => {
    const m = med({ endDate: "2026-11-20" });
    expect(isScheduledOn(m, "2026-11-20")).toBe(true);
    expect(isScheduledOn(m, "2026-11-21")).toBe(false);
  });

  it("honours the weekday filter", () => {
    const mondaysOnly = med({ daysOfWeek: [1] });
    expect(isScheduledOn(mondaysOnly, "2026-11-16")).toBe(true); // Monday
    expect(isScheduledOn(mondaysOnly, "2026-11-17")).toBe(false); // Tuesday
    expect(isScheduledOn(mondaysOnly, "2026-11-15")).toBe(false); // Sunday
  });

  it("treats an open-ended schedule as running indefinitely", () => {
    expect(isScheduledOn(med({ endDate: null }), "2030-01-01")).toBe(true);
  });
});

describe("statusAt", () => {
  const scheduled = DateTime.fromISO("2026-11-15T10:00:00Z");
  const at = (minutesFromScheduled: number) => scheduled.plus({ minutes: minutesFromScheduled });

  it("is upcoming more than 15 minutes before", () => {
    expect(statusAt(scheduled, at(-15).minus({ seconds: 1 }))).toBe("upcoming");
    expect(statusAt(scheduled, at(-120))).toBe("upcoming");
  });

  it("is due exactly 15 minutes before", () => {
    expect(statusAt(scheduled, at(-15))).toBe("due");
  });

  it("is due at the scheduled time", () => {
    expect(statusAt(scheduled, at(0))).toBe("due");
  });

  it("is due exactly 60 minutes after", () => {
    expect(statusAt(scheduled, at(60))).toBe("due");
  });

  it("is missed 61 minutes after", () => {
    expect(statusAt(scheduled, at(61))).toBe("missed");
  });
});

describe("dosesForDate", () => {
  const now = new Date("2026-11-15T06:30:00Z"); // 12:00 in Kolkata

  it("expands each time of each scheduled medication", () => {
    const doses = dosesForDate([med({ times: ["08:00", "20:00"] })], new Map(), "2026-11-15", "Asia/Kolkata", now);
    expect(doses.map((d) => [d.id, d.status])).toEqual([
      ["med_abc_2026-11-15_0800", "missed"],
      ["med_abc_2026-11-15_2000", "upcoming"],
    ]);
    expect(doses[0]).toMatchObject({ scheduledAt: "2026-11-15T02:30:00Z", loggedAt: null, loggedBy: null });
  });

  it("skips medications that are not scheduled on the date", () => {
    const doses = dosesForDate([med({ daysOfWeek: [1] })], new Map(), "2026-11-15", "Asia/Kolkata", now);
    expect(doses).toEqual([]);
  });

  it("lets a log override the computed status", () => {
    const log: DoseLog = {
      id: "med_abc_2026-11-15_0800",
      medicationId: "med_abc",
      date: "2026-11-15",
      time: "08:00",
      status: "taken",
      loggedAt: "2026-11-15T02:40:00.000Z",
      loggedBy: "Ananya",
    };
    const [dose] = dosesForDate([med()], new Map([[log.id, log]]), "2026-11-15", "Asia/Kolkata", now);
    expect(dose).toMatchObject({ status: "taken", loggedAt: log.loggedAt, loggedBy: "Ananya" });
  });

  it("sorts by time, then by name for simultaneous doses", () => {
    const meds = [
      med({ id: "med_z", name: "Zinc", times: ["08:00", "07:00"] }),
      med({ id: "med_a", name: "Aspirin", times: ["08:00"] }),
    ];
    const doses = dosesForDate(meds, new Map(), "2026-11-15", "Asia/Kolkata", now);
    expect(doses.map((d) => `${d.time} ${d.name}`)).toEqual(["07:00 Zinc", "08:00 Aspirin", "08:00 Zinc"]);
  });
});
