import { describe, expect, it } from "vitest";
import { elderClient, JOB_TOKEN, makeContext, metformin, PASSCODE, signedUpClient } from "./helpers.js";
import request from "supertest";

describe("primary journey", () => {
  it("creates a circle, adds a medicine, logs a dose and reports adherence", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    expect(code).toMatch(/^[A-Z]+-\d{4}$/);

    const med = await elder.post("/medications", metformin).expect(201);
    expect(med.body.times).toEqual(["08:00", "20:00"]);

    const doses = await elder.get("/doses?date=2026-11-15").expect(200);
    expect(doses.body.doses.map((d: { time: string; status: string }) => [d.time, d.status])).toEqual([
      ["08:00", "missed"],
      ["20:00", "upcoming"],
    ]);

    const morning = doses.body.doses[0].id as string;
    const logged = await elder.post(`/doses/${morning}/log`, { status: "taken" }).expect(200);
    expect(logged.body).toMatchObject({ status: "taken", loggedBy: "Kamala" });

    const meds = await elder.get("/medications").expect(200);
    expect(meds.body.medications[0].stock).toBe(5);

    const adherence = await elder.get("/adherence?days=1").expect(200);
    expect(adherence.body).toMatchObject({ days: 1, rate: 1 });

    const activity = await elder.get("/activity").expect(200);
    expect(activity.body.activity[0].summary).toContain("marked Metformin (08:00) as taken");
  });

  it("lets family join with code + passcode and rejects a wrong passcode", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const family = await signedUpClient(app, "Ananya");
    await family
      .post("/circles/join", { code, passcode: "wrong-pass", role: "family" })
      .expect(401)
      .expect((r) => expect(r.body.error.code).toBe("UNAUTHORIZED"));
    await family.get("/session").expect(409);
    const ok = await family.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    expect(ok.body.member.role).toBe("family");
    expect(ok.body.member.name).toBe("Ananya");
    await family.get("/session").expect(200);
  });

  it("sends reminder emails once and records them", async () => {
    const ctx = makeContext({ now: "2026-11-15T14:20:00Z" }); // 19:50 IST, 10 min before the 20:00 dose
    const { elder } = await elderClient(ctx.app);
    await elder.post("/medications", metformin).expect(201);

    const run = () => request(ctx.app).post("/api/v1/jobs/reminders").set("X-Job-Token", JOB_TOKEN).expect(200);
    const first = await run();
    expect(first.body.sent).toBeGreaterThan(0);
    const subjects = ctx.outbox.map((e) => e.subject);
    expect(subjects.some((s) => s.startsWith("Reminder: Kamala's Metformin"))).toBe(true);

    const second = await run();
    expect(second.body.sent).toBe(0);

    const notifications = await elder.get("/notifications").expect(200);
    expect(notifications.body.notifications[0].toMasked).toBe("k***@example.com");
  });
});
