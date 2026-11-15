import request from "supertest";
import { describe, expect, it } from "vitest";
import type { Email, Mailer } from "../src/adapters/mailer.js";
import type { CircleRecord, Medication } from "../src/domain/types.js";
import { elderClient, joinClient, JOB_TOKEN, makeContext, metformin, newCircle, signedUpClient, type TestContext } from "./helpers.js";

// 08:00 in Asia/Kolkata is 02:30Z.
const at = (iso: string) => new Date(iso);

/** One daily 08:00 medicine with no stock tracking, so only dose events can fire. */
const morningPill = { ...metformin, times: ["08:00"], stock: null, refillAt: null };

const runJob = (ctx: TestContext) =>
  request(ctx.app)
    .post("/api/v1/jobs/reminders")
    .set("X-Job-Token", JOB_TOKEN)
    .expect(200)
    .then((r) => r.body as { circles: number; sent: number; skipped: number });

const subjects = (ctx: TestContext) => ctx.outbox.map((e) => e.subject);
const recipients = (ctx: TestContext) => ctx.outbox.map((e) => e.to).sort();

async function setup(now: string, medication: object | null = morningPill) {
  const ctx = makeContext({ now });
  const { elder, code } = await elderClient(ctx.app);
  if (medication) await elder.post("/medications", medication).expect(201);
  return { ctx, elder, code };
}

describe("dose upcoming reminders", () => {
  it("emails within 15 minutes of the dose", async () => {
    const { ctx } = await setup("2026-11-15T02:20:00Z"); // 07:50, ten minutes before
    const result = await runJob(ctx);
    expect(result).toMatchObject({ circles: 1, sent: 1 });
    expect(ctx.outbox).toHaveLength(1);
    expect(ctx.outbox[0]).toMatchObject({ to: "kamala@example.com", subject: "Reminder: Kamala's Metformin 500 mg at 8:00 AM" });
    expect(ctx.outbox[0]!.text).toContain("It's almost time for Kamala's Metformin (500 mg) at 8:00 AM.");
  });

  it("stays quiet more than 15 minutes ahead", async () => {
    const { ctx } = await setup("2026-11-15T02:10:00Z"); // 07:40, twenty minutes before
    expect(await runJob(ctx)).toMatchObject({ sent: 0 });
    expect(ctx.outbox).toEqual([]);
  });

  it("stays quiet once the dose time has passed", async () => {
    const { ctx } = await setup("2026-11-15T02:35:00Z"); // 08:05
    await runJob(ctx);
    expect(subjects(ctx).filter((s) => s.startsWith("Reminder"))).toEqual([]);
  });

  it("is sent once across repeated runs", async () => {
    const { ctx } = await setup("2026-11-15T02:20:00Z");
    expect((await runJob(ctx)).sent).toBe(1);
    ctx.clock.now = at("2026-11-15T02:25:00Z");
    const second = await runJob(ctx);
    expect(second.sent).toBe(0);
    expect(second.skipped).toBeGreaterThan(0);
    expect(ctx.outbox).toHaveLength(1);
  });

  it("is sent again for the same medicine the next day", async () => {
    const { ctx } = await setup("2026-11-15T02:20:00Z");
    await runJob(ctx);
    ctx.clock.now = at("2026-11-16T02:20:00Z");
    expect((await runJob(ctx)).sent).toBe(1);
    expect(ctx.outbox).toHaveLength(2);
  });

  it("is not sent for paused medicines or those outside their date range", async () => {
    const { ctx, elder } = await setup("2026-11-15T02:20:00Z", null);
    const paused = (await elder.post("/medications", { ...morningPill, name: "Paused" }).expect(201)).body;
    await elder.patch(`/medications/${paused.id}`, { active: false }).expect(200);
    await elder.post("/medications", { ...morningPill, name: "Finished", endDate: "2026-11-10" }).expect(201);
    await elder.post("/medications", { ...morningPill, name: "Future", startDate: "2026-11-16" }).expect(201);
    expect(await runJob(ctx)).toMatchObject({ sent: 0 });
  });

  it("is not sent for a dose that was already logged", async () => {
    const { ctx, elder } = await setup("2026-11-15T02:20:00Z");
    const doseId = (await elder.get("/doses?date=2026-11-15").expect(200)).body.doses[0].id;
    await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
    expect(await runJob(ctx)).toMatchObject({ sent: 0 });
  });

  it("uses the circle's time zone", async () => {
    const ctx = makeContext({ now: "2026-11-15T12:50:00Z" }); // 07:50 in New York (EST)
    const elder = await signedUpClient(ctx.app, "Walt");
    await elder.post("/circles", { ...newCircle, elderName: "Walt Rivers", timezone: "America/New_York" }).expect(201);
    await elder.post("/medications", morningPill).expect(201);
    await runJob(ctx);
    expect(ctx.outbox[0]?.subject).toBe("Reminder: Walt's Metformin 500 mg at 8:00 AM");
  });
});

describe("dose missed alerts", () => {
  const missedSubjects = (ctx: TestContext) => subjects(ctx).filter((s) => s.startsWith("Missed dose"));

  it("emails 61 minutes after the dose and not before 60", async () => {
    const { ctx } = await setup("2026-11-15T03:29:00Z"); // 08:59, 59 minutes after
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual([]);

    ctx.clock.now = at("2026-11-15T03:31:00Z"); // 09:01
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual(["Missed dose: Kamala's Metformin (8:00 AM)"]);
    expect(ctx.outbox.at(-1)!.text).toContain("hasn't been marked as taken");
  });

  it("is sent only once across runs", async () => {
    const { ctx } = await setup("2026-11-15T04:00:00Z");
    await runJob(ctx);
    ctx.clock.now = at("2026-11-15T04:30:00Z");
    await runJob(ctx);
    ctx.clock.now = at("2026-11-15T05:00:00Z");
    await runJob(ctx);
    expect(missedSubjects(ctx)).toHaveLength(1);
  });

  it("is not sent when the dose was taken late", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:00:00Z");
    const doseId = (await elder.get("/doses?date=2026-11-15").expect(200)).body.doses[0].id;
    await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual([]);
  });

  it("is not sent for a dose that was skipped on purpose", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:00:00Z");
    const doseId = (await elder.get("/doses?date=2026-11-15").expect(200)).body.doses[0].id;
    await elder.post(`/doses/${doseId}/log`, { status: "skipped" }).expect(200);
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual([]);
  });

  it("ignores doses missed more than 12 hours ago", async () => {
    const { ctx } = await setup("2026-11-15T20:30:00Z"); // 02:00 on the 16th: yesterday's 08:00 was 18 hours ago
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual([]);
  });

  it("still alerts on a dose from yesterday evening that falls inside the 12 hour window", async () => {
    const { ctx } = await setup("2026-11-15T20:30:00Z", { ...morningPill, times: ["20:00"] }); // 20:00 IST = 14:30Z, six hours ago
    await runJob(ctx);
    expect(missedSubjects(ctx)).toEqual(["Missed dose: Kamala's Metformin (8:00 PM)"]);
  });
});

describe("recipients", () => {
  async function circleWithMembers(now: string) {
    const { ctx, elder, code } = await setup(now);
    const family = await joinClient(ctx.app, code, "Ananya", "family", "ananya@example.com");
    const caretaker = await joinClient(ctx.app, code, "Joy", "caretaker", "joy@example.com");
    const noEmail = await joinClient(ctx.app, code, "Quiet", "family");
    await noEmail.patch("/members/me", { email: null }).expect(200); // opts out of reminder emails
    return { ctx, elder, family, caretaker, noEmail };
  }

  it("emails every member who has an email address and the matching flag on", async () => {
    const { ctx } = await circleWithMembers("2026-11-15T02:20:00Z");
    expect((await runJob(ctx)).sent).toBe(3);
    expect(recipients(ctx)).toEqual(["ananya@example.com", "joy@example.com", "kamala@example.com"]);
  });

  it("skips members who turned dose reminders off", async () => {
    const { ctx, family } = await circleWithMembers("2026-11-15T02:20:00Z");
    await family.patch("/members/me", { notify: { doses: false, missed: true, appointments: true } }).expect(200);
    await runJob(ctx);
    expect(recipients(ctx)).toEqual(["joy@example.com", "kamala@example.com"]);
  });

  it("uses the missed flag for missed-dose alerts, independently of the dose flag", async () => {
    const { ctx, family, caretaker } = await circleWithMembers("2026-11-15T04:00:00Z");
    await family.patch("/members/me", { notify: { doses: true, missed: false, appointments: true } }).expect(200);
    await caretaker.patch("/members/me", { notify: { doses: false, missed: true, appointments: true } }).expect(200);
    await runJob(ctx);
    expect(recipients(ctx)).toEqual(["joy@example.com", "kamala@example.com"]);
  });

  it("does not use up an event when nobody wants it, so enabling the flag later still sends", async () => {
    const { ctx, elder } = await setup("2026-11-15T02:20:00Z");
    await elder.patch("/members/me", { notify: { doses: false, missed: true, appointments: true } }).expect(200);
    expect(await runJob(ctx)).toMatchObject({ sent: 0, skipped: 1 });

    await elder.patch("/members/me", { notify: { doses: true, missed: true, appointments: true } }).expect(200);
    expect(await runJob(ctx)).toMatchObject({ sent: 1 });
  });

  it("sends nothing when no member has an email", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    const elder = await signedUpClient(ctx.app, "Kamala");
    await elder.post("/circles", newCircle).expect(201);
    await elder.patch("/members/me", { email: null }).expect(200); // opts out of reminder emails
    await elder.post("/medications", morningPill).expect(201);
    expect(await runJob(ctx)).toMatchObject({ sent: 0, skipped: 1 });
    expect(ctx.outbox).toEqual([]);
  });

  it("records what was sent with masked addresses", async () => {
    const { ctx, elder } = await circleWithMembers("2026-11-15T02:20:00Z");
    await runJob(ctx);
    const { notifications } = (await elder.get("/notifications").expect(200)).body;
    expect(notifications.map((n: { toMasked: string }) => n.toMasked).sort()).toEqual(["a***@example.com", "j***@example.com", "k***@example.com"]);
    expect(notifications[0]).toMatchObject({ kind: "dose_upcoming", transport: "log", subject: expect.stringContaining("Metformin") });
    expect(JSON.stringify(notifications)).not.toContain("kamala@example.com");
  });
});

describe("appointment reminders", () => {
  const appointment = {
    doctorName: "Dr. Rao",
    specialty: "Cardiology",
    location: "City Hospital",
    startsAt: "2026-11-15T04:30:00.000Z", // 10:00 IST
    durationMinutes: 30,
    notes: "Bring reports",
    reminderMinutesBefore: 60,
  };
  const visitSubjects = (ctx: TestContext) => subjects(ctx).filter((s) => s.startsWith("Upcoming visit"));

  it("is sent inside the reminder window only", async () => {
    const { ctx, elder } = await setup("2026-11-15T03:15:00Z", null); // 08:45, 75 minutes before
    await elder.post("/appointments", appointment).expect(201);

    await runJob(ctx);
    expect(visitSubjects(ctx)).toEqual([]);

    ctx.clock.now = at("2026-11-15T04:00:00Z"); // 09:30, 30 minutes before
    expect((await runJob(ctx)).sent).toBe(1);
    expect(visitSubjects(ctx)).toEqual(["Upcoming visit: Kamala with Dr. Rao, 15 Nov, 10:00 AM"]);
    const email = ctx.outbox[0]!;
    expect(email.text).toContain("Kamala has an appointment with Dr. Rao (Cardiology) on Sunday 15 November at 10:00 AM.");
    expect(email.text).toContain("Where: City Hospital");
    expect(email.text).toContain("Notes: Bring reports");
  });

  it("is sent once, and not after the visit has started", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:00:00Z", null);
    await elder.post("/appointments", appointment).expect(201);
    await runJob(ctx);
    ctx.clock.now = at("2026-11-15T04:10:00Z");
    await runJob(ctx);
    ctx.clock.now = at("2026-11-15T04:45:00Z"); // after the start time
    await runJob(ctx);
    expect(visitSubjects(ctx)).toHaveLength(1);
  });

  it("is sent again if the visit is rescheduled", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:00:00Z", null);
    const apt = (await elder.post("/appointments", appointment).expect(201)).body;
    await runJob(ctx);
    await elder.patch(`/appointments/${apt.id}`, { startsAt: "2026-11-15T04:50:00.000Z" }).expect(200);
    ctx.clock.now = at("2026-11-15T04:05:00Z");
    await runJob(ctx);
    expect(visitSubjects(ctx)).toHaveLength(2);
  });

  it("is never sent when the reminder lead time is zero", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:25:00Z", null);
    await elder.post("/appointments", { ...appointment, reminderMinutesBefore: 0 }).expect(201);
    await runJob(ctx);
    expect(visitSubjects(ctx)).toEqual([]);
  });

  it("respects the appointments flag", async () => {
    const { ctx, elder, code } = await setup("2026-11-15T04:00:00Z", null);
    const family = await joinClient(ctx.app, code, "Ananya", "family", "ananya@example.com");
    await family.patch("/members/me", { notify: { doses: true, missed: true, appointments: false } }).expect(200);
    await elder.post("/appointments", appointment).expect(201);
    await runJob(ctx);
    expect(recipients(ctx)).toEqual(["kamala@example.com"]);
  });

  it("omits optional lines when the visit has no location or notes", async () => {
    const { ctx, elder } = await setup("2026-11-15T04:00:00Z", null);
    await elder.post("/appointments", { ...appointment, location: "", notes: "", specialty: "" }).expect(201);
    await runJob(ctx);
    expect(ctx.outbox[0]!.text).not.toMatch(/Where:|Notes:/);
    expect(ctx.outbox[0]!.text).toContain("with Dr. Rao on");
  });
});

describe("refill reminders", () => {
  const lowStock = { ...metformin, startDate: "2026-11-16", stock: 5, refillAt: 5 }; // no doses today: only refill events
  const refillSubjects = (ctx: TestContext) => subjects(ctx).filter((s) => s.startsWith("Refill soon"));

  it("is sent when stock is at or below the threshold", async () => {
    const { ctx } = await setup("2026-11-15T06:30:00Z", lowStock);
    await runJob(ctx);
    expect(refillSubjects(ctx)).toEqual(["Refill soon: Kamala's Metformin (5 left)"]);
    expect(ctx.outbox[0]!.text).toContain("Only 5 Metformin doses are left.");
  });

  it("uses the singular for a single remaining dose", async () => {
    const { ctx } = await setup("2026-11-15T06:30:00Z", { ...lowStock, stock: 1 });
    await runJob(ctx);
    expect(ctx.outbox[0]!.text).toContain("Only 1 Metformin dose is left.");
  });

  it("is not sent while stock is above the threshold or when tracking is off", async () => {
    const { ctx, elder } = await setup("2026-11-15T06:30:00Z", { ...lowStock, stock: 6 });
    await elder.post("/medications", { ...lowStock, name: "Untracked", stock: null, refillAt: null }).expect(201);
    await elder.post("/medications", { ...lowStock, name: "NoThreshold", refillAt: null }).expect(201);
    await runJob(ctx);
    expect(refillSubjects(ctx)).toEqual([]);
  });

  it("is not sent for paused medicines", async () => {
    const { ctx, elder } = await setup("2026-11-15T06:30:00Z", null);
    const med = (await elder.post("/medications", lowStock).expect(201)).body;
    await elder.patch(`/medications/${med.id}`, { active: false }).expect(200);
    await runJob(ctx);
    expect(refillSubjects(ctx)).toEqual([]);
  });

  it("is sent once per day", async () => {
    const { ctx } = await setup("2026-11-15T06:30:00Z", lowStock);
    await runJob(ctx);
    ctx.clock.now = at("2026-11-15T09:00:00Z");
    await runJob(ctx);
    expect(refillSubjects(ctx)).toHaveLength(1);

    ctx.clock.now = at("2026-11-16T06:30:00Z");
    await runJob(ctx);
    expect(refillSubjects(ctx)).toHaveLength(2);
  });

  it("follows the doses preference", async () => {
    const { ctx, elder } = await setup("2026-11-15T06:30:00Z", lowStock);
    await elder.patch("/members/me", { notify: { doses: false, missed: true, appointments: true } }).expect(200);
    await runJob(ctx);
    expect(ctx.outbox).toEqual([]);
  });

  it("is triggered by logging doses until stock reaches the threshold", async () => {
    const { ctx, elder } = await setup("2026-11-15T06:30:00Z", { ...morningPill, stock: 6, refillAt: 5 });
    await runJob(ctx);
    expect(refillSubjects(ctx)).toEqual([]);
    const doseId = (await elder.get("/doses?date=2026-11-15").expect(200)).body.doses[0].id;
    await elder.post(`/doses/${doseId}/log`, { status: "taken" }).expect(200);
    await runJob(ctx);
    expect(refillSubjects(ctx)).toEqual(["Refill soon: Kamala's Metformin (5 left)"]);
  });
});

describe("failure handling", () => {
  function flakyMailer(): { mailer: Mailer; sent: Email[]; failures: { remaining: number } } {
    const sent: Email[] = [];
    const failures = { remaining: 0 };
    const mailer: Mailer = {
      transport: "smtp",
      async send(email) {
        if (failures.remaining > 0) {
          failures.remaining -= 1;
          throw new Error("SMTP connection refused");
        }
        sent.push(email);
      },
    };
    return { mailer, sent, failures };
  }

  it("releases the claim when delivery throws so the next run retries", async () => {
    const { mailer, sent, failures } = flakyMailer();
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z", mailer });
    const { elder } = await elderClient(ctx.app);
    await elder.post("/medications", morningPill).expect(201);

    failures.remaining = 1;
    expect(await runJob(ctx)).toMatchObject({ circles: 1, sent: 0 });
    expect(sent).toEqual([]);
    expect((await elder.get("/notifications").expect(200)).body.notifications).toEqual([]);

    ctx.clock.now = at("2026-11-15T02:22:00Z");
    expect(await runJob(ctx)).toMatchObject({ sent: 1 });
    expect(sent).toHaveLength(1);

    ctx.clock.now = at("2026-11-15T02:24:00Z");
    expect(await runJob(ctx)).toMatchObject({ sent: 0 });
    expect(sent).toHaveLength(1);
  });

  it("keeps going with the remaining events after one fails", async () => {
    const { mailer, sent, failures } = flakyMailer();
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z", mailer });
    const { elder } = await elderClient(ctx.app);
    await elder.post("/medications", { ...morningPill, name: "Alpha" }).expect(201);
    await elder.post("/medications", { ...morningPill, name: "Beta" }).expect(201);
    failures.remaining = 1;
    const result = await runJob(ctx);
    expect(result.sent).toBe(1);
    expect(sent).toHaveLength(1);
  });

  it("does not let one broken circle stop reminders for the others", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    // Inserted first so it is processed before the healthy circle.
    const broken: CircleRecord = {
      id: "cir_broken",
      code: "BROKEN-0001",
      elderName: "Broken Circle",
      timezone: "Not/AZone",
      createdAt: "2026-11-01T00:00:00.000Z",
      passcodeHash: "scrypt$x",
    };
    await ctx.deps.store.circles.create(broken);
    await ctx.deps.store.members.put(broken.id, {
      id: "mem_broken",
      name: "Broken",
      role: "elder",
      email: "broken@example.com",
      notify: { doses: true, missed: true, appointments: true },
      joinedAt: broken.createdAt,
    });
    const badMed: Medication = {
      id: "med_broken",
      name: "Broken pill",
      dosage: "1",
      instructions: "",
      times: ["08:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: "2026-11-01",
      endDate: null,
      stock: null,
      refillAt: null,
      color: "white",
      shape: "round",
      active: true,
      createdBy: "x",
      updatedAt: broken.createdAt,
    };
    await ctx.deps.store.medications.put(broken.id, badMed);

    const { elder } = await elderClient(ctx.app);
    await elder.post("/medications", morningPill).expect(201);

    const result = await runJob(ctx);
    expect(result.circles).toBe(2);
    expect(ctx.outbox.map((e) => e.to)).toContain("kamala@example.com");
  });

  it("isolates a circle whose data cannot be read", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    const original = ctx.deps.store.medications.list.bind(ctx.deps.store.medications);
    const { elder: first } = await elderClient(ctx.app);
    const secondClient = await signedUpClient(ctx.app, "Second");
    await secondClient.post("/circles", { ...newCircle, elderName: "Second Person" }).expect(201);
    await first.post("/medications", morningPill).expect(201);
    await secondClient.post("/medications", morningPill).expect(201);

    const firstId = (await first.get("/session").expect(200)).body.circle.id as string;
    ctx.deps.store.medications.list = async (circleId, options) => {
      if (circleId === firstId) throw new Error("storage unavailable");
      return original(circleId, options);
    };

    expect(await runJob(ctx)).toMatchObject({ circles: 2, sent: 1 });
    expect(recipients(ctx)).toEqual(["second@example.com"]);
  });

  it("reports zero circles when there is nothing to do", async () => {
    const ctx = makeContext();
    expect(await runJob(ctx)).toEqual({ circles: 0, sent: 0, skipped: 0 });
  });
});

describe("email content", () => {
  it("escapes user-provided names in the HTML body", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    const { elder, code } = await elderClient(ctx.app);
    await joinClient(ctx.app, code, 'Eve <img src=x onerror="alert(1)">', "family", "eve@example.com");
    await elder.post("/medications", { ...morningPill, name: "<script>alert('x')</script>" }).expect(201);

    await runJob(ctx);
    const toEve = ctx.outbox.find((e) => e.to === "eve@example.com")!;
    expect(toEve.html).not.toContain("<script>");
    expect(toEve.html).not.toContain("<img");
    expect(toEve.html).toContain("&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;");
    expect(toEve.html).toContain("Hi Eve &lt;img src=x onerror=&quot;alert(1)&quot;&gt;,");
    // Plain-text parts are not interpreted as markup, so they keep the original characters.
    expect(toEve.text).toContain("<script>alert('x')</script>");
  });

  it("escapes the elder's name when it appears in subjects and headings", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    const elder = await signedUpClient(ctx.app, "Bold");
    await elder.post("/circles", { ...newCircle, elderName: "<b>Bold</b> Person" }).expect(201);
    await elder.post("/medications", morningPill).expect(201);
    await runJob(ctx);
    expect(ctx.outbox[0]!.html).not.toContain("<b>Bold");
    expect(ctx.outbox[0]!.html).toContain("&lt;b&gt;Bold&lt;/b&gt;&#39;s Metformin");
  });

  it("includes a link back to the app and the standard envelope", async () => {
    const ctx = makeContext({ now: "2026-11-15T02:20:00Z" });
    const { elder } = await elderClient(ctx.app);
    await elder.post("/medications", morningPill).expect(201);
    await runJob(ctx);
    const email = ctx.outbox[0]!;
    expect(email.text).toMatch(/^Hi Kamala,\n/);
    expect(email.text).toContain("Open Hearth: http://localhost:5173/app");
    expect(email.html).toContain('href="http://localhost:5173/app"');
    expect(email.html.startsWith("<!doctype html>")).toBe(true);
  });
});
