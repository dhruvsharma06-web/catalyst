import { describe, expect, it } from "vitest";
import { client, elderClient, joinClient, makeContext, metformin, newCircle, PASSCODE, PASSWORD, signedUpClient } from "./helpers.js";

// The default test clock is 2026-11-15T06:30Z, which is Sunday 12:00 in Asia/Kolkata.
const TODAY = "2026-11-15";

const appointment = {
  doctorName: "Dr. Rao",
  specialty: "Cardiology",
  location: "City Hospital",
  startsAt: "2026-11-20T04:30:00.000Z",
  durationMinutes: 30,
  notes: "Bring reports",
  reminderMinutesBefore: 60,
};

const invalid = (res: { body: { error: { code: string; details: Array<{ field: string; reason: string }> } } }, field: string) => {
  expect(res.body.error.code).toBe("INVALID_INPUT");
  expect(res.body.error.details.map((d) => d.field)).toContain(field);
};

describe("medications", () => {
  it("creates, lists, updates and deletes a medication", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);

    const created = await elder.post("/medications", metformin).expect(201);
    expect(created.body).toMatchObject({
      name: "Metformin",
      times: ["08:00", "20:00"],
      active: true,
      createdBy: "Kamala",
      id: expect.stringMatching(/^med_/),
    });

    const listed = await elder.get("/medications").expect(200);
    expect(listed.body.medications).toHaveLength(1);

    const patched = await elder.patch(`/medications/${created.body.id}`, { dosage: "850 mg", times: ["21:00", "07:00"] }).expect(200);
    expect(patched.body).toMatchObject({ dosage: "850 mg", times: ["07:00", "21:00"], name: "Metformin" });

    await elder.delete(`/medications/${created.body.id}`).expect(204);
    await elder.delete(`/medications/${created.body.id}`).expect(404);
    await elder.patch(`/medications/${created.body.id}`, { dosage: "1 g" }).expect(404);
    expect((await elder.get("/medications").expect(200)).body.medications).toEqual([]);
  });

  it("sorts active medicines first, then by name", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const zinc = (await elder.post("/medications", { ...metformin, name: "Zinc" }).expect(201)).body;
    await elder.post("/medications", { ...metformin, name: "Aspirin" }).expect(201);
    const paused = (await elder.post("/medications", { ...metformin, name: "Allopurinol" }).expect(201)).body;
    await elder.patch(`/medications/${paused.id}`, { active: false }).expect(200);

    const names = (await elder.get("/medications").expect(200)).body.medications.map((m: { name: string }) => m.name);
    expect(names).toEqual(["Aspirin", "Zinc", "Allopurinol"]);
    expect(zinc.id).toBeDefined();
  });

  it("accepts the optional fields as null and an empty instruction", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/medications", { ...metformin, instructions: "", stock: null, refillAt: null }).expect(201);
    expect(res.body).toMatchObject({ instructions: "", stock: null, refillAt: null });
  });

  it("normalises days of the week to ascending order", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/medications", { ...metformin, daysOfWeek: [5, 1, 3] }).expect(201);
    expect(res.body.daysOfWeek).toEqual([1, 3, 5]);
  });

  describe("validation", () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["no times", { times: [] }, "times"],
      ["duplicate times", { times: ["08:00", "08:00"] }, "times"],
      ["more than eight times", { times: ["01:00", "02:00", "03:00", "04:00", "05:00", "06:00", "07:00", "08:00", "09:00"] }, "times"],
      ["malformed time", { times: ["8am"] }, "times.0"],
      ["out-of-range time", { times: ["24:00"] }, "times.0"],
      ["end date before start date", { startDate: "2026-11-10", endDate: "2026-11-09" }, "endDate"],
      ["invalid colour", { color: "purple" }, "color"],
      ["invalid shape", { shape: "star" }, "shape"],
      ["no days", { daysOfWeek: [] }, "daysOfWeek"],
      ["duplicate days", { daysOfWeek: [1, 1] }, "daysOfWeek"],
      ["day out of range", { daysOfWeek: [7] }, "daysOfWeek.0"],
      ["blank name", { name: "   " }, "name"],
      ["over-long name", { name: "n".repeat(81) }, "name"],
      ["negative stock", { stock: -1 }, "stock"],
      ["fractional stock", { stock: 1.5 }, "stock"],
      ["bad start date", { startDate: "2026-13-01" }, "startDate"],
    ];

    it.each(cases)("rejects %s", async (_label, override, field) => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      const res = await elder.post("/medications", { ...metformin, ...override }).expect(400);
      invalid(res, field);
    });

    it.each(["name", "dosage", "times", "daysOfWeek", "startDate", "color", "shape"])("requires %s", async (field) => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      const body: Record<string, unknown> = { ...metformin };
      delete body[field];
      await elder.post("/medications", body).expect(400);
    });

    it("accepts an end date equal to the start date", async () => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      await elder.post("/medications", { ...metformin, startDate: "2026-11-10", endDate: "2026-11-10" }).expect(201);
    });

    it("rejects an empty or invalid patch", async () => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      const med = (await elder.post("/medications", metformin).expect(201)).body;
      await elder.patch(`/medications/${med.id}`, {}).expect(400);
      await elder.patch(`/medications/${med.id}`, { color: "purple" }).expect(400);
      await elder.patch(`/medications/${med.id}`, { id: "other" }).expect(400);
    });
  });

  it("removes a paused medication from the day's doses and restores it when resumed", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", metformin).expect(201)).body;
    expect((await elder.get(`/doses?date=${TODAY}`).expect(200)).body.doses).toHaveLength(2);

    await elder.patch(`/medications/${med.id}`, { active: false }).expect(200);
    expect((await elder.get(`/doses?date=${TODAY}`).expect(200)).body.doses).toEqual([]);

    await elder.patch(`/medications/${med.id}`, { active: true }).expect(200);
    expect((await elder.get(`/doses?date=${TODAY}`).expect(200)).body.doses).toHaveLength(2);
  });

  it("records activity for create, pause, resume, update and delete", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", metformin).expect(201)).body;
    await elder.patch(`/medications/${med.id}`, { active: false }).expect(200);
    await elder.patch(`/medications/${med.id}`, { active: true }).expect(200);
    await elder.patch(`/medications/${med.id}`, { times: ["09:00"] }).expect(200);
    await elder.patch(`/medications/${med.id}`, { dosage: "1 g" }).expect(200);
    await elder.patch(`/medications/${med.id}`, { instructions: "After meals" }).expect(200);
    await elder.delete(`/medications/${med.id}`).expect(204);

    const kinds = (await elder.get("/activity").expect(200)).body.activity.map((a: { kind: string; summary: string }) => a.summary);
    expect(kinds).toEqual([
      "Kamala removed Metformin",
      "Kamala updated Metformin",
      "Kamala changed Metformin dose to 1 g",
      "Kamala changed Metformin times to 09:00",
      "Kamala resumed Metformin",
      "Kamala paused Metformin",
      "Kamala added Metformin 500 mg at 08:00, 20:00",
      "Kamala created the care circle for Kamala Iyer",
    ]);
  });
});

describe("doses", () => {
  it("defaults to today in the circle's time zone", async () => {
    const { app } = makeContext({ now: "2026-11-15T20:00:00Z" }); // already Monday 16th in Kolkata
    const { elder } = await elderClient(app);
    await elder.post("/medications", metformin).expect(201);
    const res = await elder.get("/doses").expect(200);
    expect(res.body.date).toBe("2026-11-16");
  });

  it("returns doses sorted by time with the contract shape", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/medications", { ...metformin, name: "Zinc", times: ["07:00"] }).expect(201);
    await elder.post("/medications", { ...metformin, name: "Aspirin", times: ["20:00", "09:00"] }).expect(201);
    const { doses } = (await elder.get(`/doses?date=${TODAY}`).expect(200)).body;
    expect(doses.map((d: { time: string }) => d.time)).toEqual(["07:00", "09:00", "20:00"]);
    expect(doses[0]).toEqual({
      id: expect.stringMatching(/^med_.+_2026-11-15_0700$/),
      medicationId: expect.any(String),
      name: "Zinc",
      dosage: "500 mg",
      color: "white",
      shape: "oval",
      time: "07:00",
      scheduledAt: "2026-11-15T01:30:00Z",
      status: "missed",
      loggedAt: null,
      loggedBy: null,
    });
  });

  it("marks a dose as due inside the window around its scheduled time", async () => {
    const { app } = makeContext({ now: "2026-11-15T14:20:00Z" }); // 19:50 IST
    const { elder } = await elderClient(app);
    await elder.post("/medications", metformin).expect(201);
    const { doses } = (await elder.get(`/doses?date=${TODAY}`).expect(200)).body;
    expect(doses.map((d: { status: string }) => d.status)).toEqual(["missed", "due"]);
  });

  it("logs a dose as taken and attributes it to the member", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await elder.post("/medications", metformin).expect(201);
    const doseId = (await family.get(`/doses?date=${TODAY}`).expect(200)).body.doses[1].id;

    const res = await family.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
    expect(res.body).toMatchObject({ id: doseId, status: "taken", loggedBy: "Ananya", loggedAt: expect.any(String) });
    const again = (await elder.get(`/doses?date=${TODAY}`).expect(200)).body.doses[1];
    expect(again).toMatchObject({ status: "taken", loggedBy: "Ananya" });
  });

  it("rejects an invalid log status", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/medications", metformin).expect(201);
    const doseId = (await elder.get(`/doses?date=${TODAY}`).expect(200)).body.doses[0].id;
    await elder.post(`/doses/${doseId}/log`, { status: "missed" }).expect(400);
    await elder.post(`/doses/${doseId}/log`, {}).expect(400);
  });

  it("refuses to log a dose more than 36 hours ahead", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", metformin).expect(201)).body;
    const res = await elder.post(`/doses/${med.id}_2026-11-17_0800/log`, { status: "taken" }).expect(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("allows logging a dose within 36 hours ahead", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", metformin).expect(201)).body;
    // 2026-11-16 20:00 IST is 32 hours after the test clock.
    await elder.post(`/doses/${med.id}_2026-11-16_2000/log`, { status: "taken" }).expect(200);
  });

  it("returns 404 for dose ids that do not exist", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", { ...metformin, daysOfWeek: [1] }).expect(201)).body;
    for (const id of [
      "garbage",
      "med_unknown_2026-11-15_0800", // unknown medication
      `${med.id}_2026-11-15_0900`, // time is not in the schedule
      `${med.id}_2026-11-15_0800`, // Sunday: not a scheduled weekday
      `${med.id}_2026-10-20_0800`, // before the start date
    ]) {
      const res = await elder.post(`/doses/${id}/log`, { status: "taken" });
      expect(res.status, id).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    }
  });

  describe("stock", () => {
    async function setup() {
      const ctx = makeContext();
      const { elder } = await elderClient(ctx.app);
      const med = (await elder.post("/medications", { ...metformin, stock: 6 }).expect(201)).body;
      const doseId = `${med.id}_${TODAY}_0800`;
      const stock = async () => (await elder.get("/medications").expect(200)).body.medications[0].stock as number;
      return { elder, doseId, stock };
    }

    it("decrements when taken", async () => {
      const { elder, doseId, stock } = await setup();
      await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
      expect(await stock()).toBe(5);
    });

    it("does not decrement twice when taken is logged again", async () => {
      const { elder, doseId, stock } = await setup();
      await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
      await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
      expect(await stock()).toBe(5);
    });

    it("restores the pill when a taken dose is re-logged as skipped", async () => {
      const { elder, doseId, stock } = await setup();
      await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
      const res = await elder.post(`/doses/${doseId}/log`, { status: "skipped" }).expect(200);
      expect(res.body.status).toBe("skipped");
      expect(await stock()).toBe(6);
    });

    it("does not change when a dose is skipped", async () => {
      const { elder, doseId, stock } = await setup();
      await elder.post(`/doses/${doseId}/log`, { status: "skipped" }).expect(200);
      expect(await stock()).toBe(6);
    });

    it("decrements when a skipped dose is later marked taken", async () => {
      const { elder, doseId, stock } = await setup();
      await elder.post(`/doses/${doseId}/log`, { status: "skipped" }).expect(200);
      await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
      expect(await stock()).toBe(5);
    });

    it("never goes below zero", async () => {
      const ctx = makeContext();
      const { elder } = await elderClient(ctx.app);
      const med = (await elder.post("/medications", { ...metformin, stock: 0 }).expect(201)).body;
      await elder.post(`/doses/${med.id}_${TODAY}_0800/log`, { status: "taken" }).expect(200);
      expect((await elder.get("/medications").expect(200)).body.medications[0].stock).toBe(0);
    });

    it("leaves untracked stock (null) alone", async () => {
      const ctx = makeContext();
      const { elder } = await elderClient(ctx.app);
      const med = (await elder.post("/medications", { ...metformin, stock: null, refillAt: null }).expect(201)).body;
      await elder.post(`/doses/${med.id}_${TODAY}_0800/log`, { status: "taken" }).expect(200);
      expect((await elder.get("/medications").expect(200)).body.medications[0].stock).toBeNull();
    });
  });
});

describe("adherence", () => {
  it("summarises settled doses per day and per medication", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", metformin).expect(201)).body;
    await elder.post(`/doses/${med.id}_${TODAY}_0800/log`, { status: "taken" }).expect(200);

    const res = await elder.get("/adherence?days=2").expect(200);
    expect(res.body.days).toBe(2);
    expect(res.body.byDay).toEqual([
      { date: "2026-11-14", scheduled: 2, taken: 0, skipped: 0, missed: 2 },
      { date: TODAY, scheduled: 2, taken: 1, skipped: 0, missed: 0 },
    ]);
    expect(res.body.rate).toBe(0.33); // 1 taken of 3 settled (the 20:00 dose is still upcoming)
    expect(res.body.streakDays).toBe(0);
    expect(res.body.byMedication).toEqual([{ medicationId: med.id, name: "Metformin", rate: 0.33 }]);
  });

  it("defaults to seven days and reports a null rate with no data", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.get("/adherence").expect(200);
    expect(res.body).toMatchObject({ days: 7, rate: null, streakDays: 0, byMedication: [] });
    expect(res.body.byDay).toHaveLength(7);
  });
});

describe("appointments", () => {
  it("creates, updates, lists and deletes an appointment", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const created = await elder.post("/appointments", appointment).expect(201);
    expect(created.body).toMatchObject({ ...appointment, id: expect.stringMatching(/^apt_/), createdBy: "Kamala" });

    const patched = await elder.patch(`/appointments/${created.body.id}`, { location: "Clinic 2", durationMinutes: 45 }).expect(200);
    expect(patched.body).toMatchObject({ location: "Clinic 2", durationMinutes: 45, doctorName: "Dr. Rao" });

    await elder.delete(`/appointments/${created.body.id}`).expect(204);
    await elder.delete(`/appointments/${created.body.id}`).expect(404);
    await elder.patch(`/appointments/${created.body.id}`, { notes: "x" }).expect(404);
    expect((await elder.get("/appointments?scope=all").expect(200)).body.appointments).toEqual([]);
  });

  it("normalises start times with an offset to UTC", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/appointments", { ...appointment, startsAt: "2026-11-20T10:00:00+05:30" }).expect(201);
    expect(res.body.startsAt).toBe("2026-11-20T04:30:00.000Z");
  });

  describe("validation", () => {
    const cases: Array<[string, Record<string, unknown>, string]> = [
      ["blank doctor", { doctorName: " " }, "doctorName"],
      ["duration under 5", { durationMinutes: 4 }, "durationMinutes"],
      ["duration over 480", { durationMinutes: 481 }, "durationMinutes"],
      ["reminder over a week", { reminderMinutesBefore: 10081 }, "reminderMinutesBefore"],
      ["negative reminder", { reminderMinutesBefore: -1 }, "reminderMinutesBefore"],
      ["start without a time zone", { startsAt: "2026-11-20T10:00:00" }, "startsAt"],
      ["non-date start", { startsAt: "next tuesday" }, "startsAt"],
      ["over-long notes", { notes: "n".repeat(501) }, "notes"],
    ];
    it.each(cases)("rejects %s", async (_label, override, field) => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      invalid(await elder.post("/appointments", { ...appointment, ...override }).expect(400), field);
    });

    it("rejects an empty patch", async () => {
      const { app } = makeContext();
      const { elder } = await elderClient(app);
      const apt = (await elder.post("/appointments", appointment).expect(201)).body;
      await elder.patch(`/appointments/${apt.id}`, {}).expect(400);
    });
  });

  it("filters by scope using the clock and orders each scope sensibly", async () => {
    const { app } = makeContext(); // now = 2026-11-15T06:30Z
    const { elder } = await elderClient(app);
    const add = async (doctorName: string, startsAt: string, durationMinutes = 30) =>
      (await elder.post("/appointments", { ...appointment, doctorName, startsAt, durationMinutes }).expect(201)).body;
    await add("Later", "2026-11-25T04:00:00.000Z");
    await add("Old", "2026-11-01T04:00:00.000Z");
    await add("Soon", "2026-11-20T04:00:00.000Z");
    await add("Older", "2026-10-01T04:00:00.000Z");
    await add("Ongoing", "2026-11-15T06:15:00.000Z", 60); // started 15 minutes ago, still running
    await add("Just ended", "2026-11-15T05:00:00.000Z", 30);

    const names = async (scope?: string) =>
      (await elder.get(`/appointments${scope ? `?scope=${scope}` : ""}`).expect(200)).body.appointments.map((a: { doctorName: string }) => a.doctorName);

    expect(await names()).toEqual(["Ongoing", "Soon", "Later"]);
    expect(await names("upcoming")).toEqual(["Ongoing", "Soon", "Later"]);
    expect(await names("past")).toEqual(["Just ended", "Old", "Older"]);
    expect(await names("all")).toEqual(["Older", "Old", "Just ended", "Ongoing", "Soon", "Later"]);
  });

  it("moves an appointment from upcoming to past as the clock advances", async () => {
    const ctx = makeContext();
    const { elder } = await elderClient(ctx.app);
    await elder.post("/appointments", appointment).expect(201);
    expect((await elder.get("/appointments").expect(200)).body.appointments).toHaveLength(1);

    ctx.clock.now = new Date("2026-11-21T00:00:00Z");
    expect((await elder.get("/appointments").expect(200)).body.appointments).toHaveLength(0);
    expect((await elder.get("/appointments?scope=past").expect(200)).body.appointments).toHaveLength(1);
  });

  it("downloads a calendar file", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const apt = (await elder.post("/appointments", appointment).expect(201)).body;
    const res = await elder.get(`/appointments/${apt.id}/ics`).expect(200);
    expect(res.headers["content-type"]).toMatch(/^text\/calendar/);
    expect(res.headers["content-disposition"]).toBe(`attachment; filename="appointment-${apt.id}.ics"`);
    expect(res.text.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(res.text).toContain("SUMMARY:Kamala Iyer: Dr. Rao (Cardiology)");
    expect(res.text).toContain("DTSTART:20261120T043000Z");
    expect(res.text).toContain("DTEND:20261120T050000Z");
    await elder.get("/appointments/apt_missing/ics").expect(404);
  });
});

describe("activity and notifications", () => {
  it("lists activity newest first and honours the limit", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/medications", { ...metformin, name: "First" }).expect(201);
    await elder.post("/medications", { ...metformin, name: "Second" }).expect(201);
    await elder.post("/appointments", appointment).expect(201);

    const all = (await elder.get("/activity").expect(200)).body.activity;
    expect(all.map((a: { kind: string }) => a.kind)).toEqual([
      "appointment.created",
      "medication.created",
      "medication.created",
      "circle.created",
    ]);
    expect(all[0]).toMatchObject({ actorName: "Kamala", actorRole: "elder", summary: "Kamala added a visit with Dr. Rao" });

    const limited = (await elder.get("/activity?limit=2").expect(200)).body.activity;
    expect(limited.map((a: { kind: string }) => a.kind)).toEqual(["appointment.created", "medication.created"]);
    expect(limited[1].summary).toContain("Second");
  });

  it("records joins and removals", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    await joinClient(app, code, "Ananya", "family");
    const summaries = (await elder.get("/activity").expect(200)).body.activity.map((a: { summary: string }) => a.summary);
    expect(summaries[0]).toBe("Ananya joined as family");
  });

  it("lists notifications (empty to begin with) and validates the limit", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    expect((await elder.get("/notifications").expect(200)).body).toEqual({ notifications: [] });
    await elder.get("/notifications?limit=0").expect(400);
  });
});

describe("members", () => {
  it("lists the elder first, then caretakers, then family by name", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    await joinClient(app, code, "Zed", "family");
    await joinClient(app, code, "Bob", "caretaker");
    await joinClient(app, code, "Amy", "family");

    const members = (await elder.get("/members").expect(200)).body.members;
    expect(members.map((m: { name: string; role: string }) => `${m.role}:${m.name}`)).toEqual([
      "elder:Kamala",
      "caretaker:Bob",
      "family:Amy",
      "family:Zed",
    ]);
    expect(members[0]).toMatchObject({
      email: "kamala@example.com",
      notify: { doses: true, missed: true, appointments: true },
    });
  });

  it("re-uses the existing member when the same account joins again", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family", "ananya@example.com");
    const first = (await family.get("/session").expect(200)).body.member;
    // Joining again (even asking for another role) returns the existing membership unchanged.
    const again = await family.post("/circles/join", { code, passcode: PASSCODE, role: "caretaker" }).expect(200);
    expect(again.body.member).toEqual(first);
    const members = (await elder.get("/members").expect(200)).body.members;
    expect(members.filter((m: { role: string }) => m.role !== "elder")).toEqual([
      expect.objectContaining({ id: first.id, name: "Ananya", role: "family", email: "ananya@example.com" }),
    ]);
  });

  it("binds each member to an account: id, name and default email come from the account", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const signup = await client(app).post("/auth/signup", { name: "Ananya", email: "Ananya@Example.com", password: PASSWORD }).expect(201);
    const user = signup.body.user;
    const family = await joinClient(app, code, "Ravi", "family");
    expect((await family.get("/session").expect(200)).body.member.id).not.toBe(user.id);
    const ananya = client(app);
    await ananya.post("/auth/login", { email: "ananya@example.com", password: PASSWORD }).expect(200);
    const me = await ananya.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    expect(me.body.member).toMatchObject({ id: user.id, name: "Ananya", email: "ananya@example.com" });
  });

  it("updates email and notification preferences for the signed-in member", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");

    const res = await family
      .patch("/members/me", { email: "Ananya@Example.com", notify: { doses: false, missed: true, appointments: false } })
      .expect(200);
    expect(res.body).toMatchObject({
      name: "Ananya",
      email: "ananya@example.com",
      notify: { doses: false, missed: true, appointments: false },
    });
    expect((await family.get("/session").expect(200)).body.member.email).toBe("ananya@example.com");
  });

  it("can clear the reminder email, cannot rename (name comes from the account), and only touches the caller", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family", "a@example.com");
    await family.patch("/members/me", { name: "Ananya S" }).expect(400);
    const res = await family.patch("/members/me", { email: null }).expect(200);
    expect(res.body).toMatchObject({ name: "Ananya", email: null });
    const kamala = (await elder.get("/members").expect(200)).body.members.find((m: { role: string }) => m.role === "elder");
    expect(kamala.email).toBe("kamala@example.com");
  });

  it("validates member updates", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    invalid(await elder.patch("/members/me", { email: "not-an-email" }).expect(400), "email");
    await elder.patch("/members/me", { role: "family" }).expect(400);
    await elder.patch("/members/me", { notify: { doses: true } }).expect(400);
    await elder.patch("/members/me", { name: "" }).expect(400);
  });
});

describe("circle creation and sign-in validation", () => {
  it("returns the circle with its shareable code and never the passcode hash", async () => {
    const { app } = makeContext();
    const res = await (await signedUpClient(app, "Kamala")).post("/circles", newCircle).expect(201);
    expect(res.body.member).toMatchObject({ id: expect.stringMatching(/^usr_/), name: "Kamala", role: "elder", email: "kamala@example.com" });
    expect(res.body.circle).toEqual({
      id: expect.stringMatching(/^cir_/),
      code: expect.stringMatching(/^[A-Z]+-\d{4}$/),
      elderName: "Kamala Iyer",
      timezone: "Asia/Kolkata",
      createdAt: expect.any(String),
    });
    expect(JSON.stringify(res.body)).not.toMatch(/scrypt|passcodeHash|sessionVersion/);
  });

  it.each([
    ["unknown time zone", { timezone: "Mars/Olympus" }, "timezone"],
    ["short passcode", { passcode: "12345" }, "passcode"],
    ["blank elder name", { elderName: "" }, "elderName"],
    ["bad role", { role: "admin" }, "role"],
    ["legacy member object", { member: { name: "K", role: "elder", email: null } }, "body"],
  ])("rejects %s", async (_label, override, field) => {
    const { app } = makeContext();
    const user = await signedUpClient(app, "Kamala");
    invalid(await user.post("/circles", { ...newCircle, ...override }).expect(400), field);
  });

  it("rejects a malformed circle code when joining", async () => {
    const { app } = makeContext();
    const user = await signedUpClient(app, "Ananya");
    const res = await user.post("/circles/join", { code: "nope", passcode: "x", role: "family" }).expect(400);
    invalid(res, "code");
  });

  it("rejects the removed identity fields when joining", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const user = await signedUpClient(app, "Ananya");
    await user.post("/circles/join", { code, passcode: PASSCODE, role: "family", name: "A", email: null }).expect(400);
  });

  it("accepts a lower-case circle code", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const user = await signedUpClient(app, "Ananya");
    await user.post("/circles/join", { code: code.toLowerCase(), passcode: PASSCODE, role: "family" }).expect(200);
  });
});
