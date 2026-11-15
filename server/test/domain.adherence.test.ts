import { describe, expect, it } from "vitest";
import { buildAdherence } from "../src/domain/adherence.js";
import type { Dose, DoseStatus, Medication } from "../src/domain/types.js";

let seq = 0;
function dose(status: DoseStatus, medicationId = "med_a"): Dose {
  seq += 1;
  return {
    id: `${medicationId}_x_${seq}`,
    medicationId,
    name: medicationId,
    dosage: "1",
    color: "white",
    shape: "round",
    time: "08:00",
    scheduledAt: "2026-11-15T02:30:00Z",
    status,
    loggedAt: null,
    loggedBy: null,
  };
}

const day = (date: string, ...statuses: DoseStatus[]) => ({ date, doses: statuses.map((s) => dose(s)) });

function medication(id: string, name: string): Medication {
  return {
    id,
    name,
    dosage: "1",
    instructions: "",
    times: ["08:00"],
    daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
    startDate: "2026-01-01",
    endDate: null,
    stock: null,
    refillAt: null,
    color: "white",
    shape: "round",
    active: true,
    createdBy: "x",
    updatedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("buildAdherence rate", () => {
  it("counts only settled doses and ignores due and upcoming", () => {
    const report = buildAdherence([day("2026-11-15", "taken", "missed", "due", "upcoming")], []);
    expect(report.rate).toBe(0.5);
    expect(report.byDay[0]).toMatchObject({ scheduled: 4, taken: 1, skipped: 0, missed: 1 });
  });

  it("is null when nothing has settled", () => {
    expect(buildAdherence([day("2026-11-15", "due", "upcoming")], []).rate).toBeNull();
    expect(buildAdherence([], []).rate).toBeNull();
    expect(buildAdherence([day("2026-11-15")], []).rate).toBeNull();
  });

  it("treats skipped doses as settled but not taken", () => {
    const report = buildAdherence([day("2026-11-15", "taken", "skipped")], []);
    expect(report.rate).toBe(0.5);
    expect(report.byDay[0]).toMatchObject({ taken: 1, skipped: 1 });
  });

  it("rounds to two decimals", () => {
    expect(buildAdherence([day("2026-11-15", "taken", "taken", "missed")], []).rate).toBe(0.67);
  });

  it("reports the number of days in the window", () => {
    expect(buildAdherence([day("2026-11-14"), day("2026-11-15")], []).days).toBe(2);
  });
});

describe("buildAdherence streak", () => {
  it("counts consecutive fully taken days", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "taken", "taken"), day("d3", "taken")], []);
    expect(report.streakDays).toBe(3);
  });

  it("neither breaks nor extends on today while it is still in progress", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "taken"), day("d3", "taken", "due", "upcoming")], []);
    expect(report.streakDays).toBe(2);
  });

  it("is broken by a missed dose on a past day", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "taken", "missed"), day("d3", "taken")], []);
    expect(report.streakDays).toBe(1);
  });

  it("is broken by a skipped dose", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "skipped"), day("d3", "taken")], []);
    expect(report.streakDays).toBe(1);
  });

  it("is broken by an unsettled dose on a past day", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "taken", "upcoming"), day("d3", "taken")], []);
    expect(report.streakDays).toBe(1);
  });

  it("treats days with nothing scheduled as neutral", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2"), day("d3", "taken")], []);
    expect(report.streakDays).toBe(2);
  });

  it("is zero when today already has a missed dose", () => {
    const report = buildAdherence([day("d1", "taken"), day("d2", "missed")], []);
    expect(report.streakDays).toBe(0);
  });

  it("is zero with no history", () => {
    expect(buildAdherence([], []).streakDays).toBe(0);
  });
});

describe("buildAdherence byMedication", () => {
  it("reports per-medication rates in the order of the medication list", () => {
    const meds = [medication("med_a", "Aspirin"), medication("med_b", "Beta")];
    const doses = [dose("taken", "med_a"), dose("taken", "med_a"), dose("missed", "med_b"), dose("taken", "med_b")];
    const report = buildAdherence([{ date: "d1", doses }], meds);
    expect(report.byMedication).toEqual([
      { medicationId: "med_a", name: "Aspirin", rate: 1 },
      { medicationId: "med_b", name: "Beta", rate: 0.5 },
    ]);
  });

  it("omits medications that have no settled doses", () => {
    const meds = [medication("med_a", "Aspirin"), medication("med_b", "Beta")];
    const report = buildAdherence([{ date: "d1", doses: [dose("taken", "med_a"), dose("upcoming", "med_b")] }], meds);
    expect(report.byMedication.map((m) => m.medicationId)).toEqual(["med_a"]);
  });
});
