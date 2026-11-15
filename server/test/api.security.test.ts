import request from "supertest";
import { describe, expect, it } from "vitest";
import { AiUnavailableError, type AiClient } from "../src/adapters/ai/types.js";
import { createLocalAiClient } from "../src/adapters/ai/local.js";
import { client, elderClient, joinClient, JOB_TOKEN, makeContext, metformin, newCircle, PASSCODE, PASSWORD, signedUpClient } from "./helpers.js";

const appointment = {
  doctorName: "Dr. Rao",
  specialty: "Cardiology",
  location: "City Hospital",
  startsAt: "2026-11-20T04:30:00.000Z",
  durationMinutes: 30,
  notes: "",
  reminderMinutesBefore: 60,
};

const errorShape = (code: string) => ({ error: { code, message: expect.any(String), details: expect.any(Array) } });

describe("request guards", () => {
  it("rejects a state-changing request without the CSRF header", async () => {
    const { app } = makeContext();
    const res = await request(app).post("/api/v1/circles").send(newCircle);
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject(errorShape("FORBIDDEN"));
  });

  it("rejects a CSRF header with the wrong value", async () => {
    const { app } = makeContext();
    const res = await request(app).post("/api/v1/circles").set("X-Requested-With", "XMLHttpRequest").send(newCircle);
    expect(res.status).toBe(403);
  });

  it("does not require the CSRF header for reads", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/api/v1/session");
    expect(res.status).toBe(401);
  });

  it("returns 401 in the contract error shape when there is no cookie", async () => {
    const { app } = makeContext();
    for (const path of ["/session", "/members", "/medications", "/doses", "/adherence", "/appointments", "/activity", "/notifications", "/ai/care-summary"]) {
      const res = await request(app).get(`/api/v1${path}`);
      expect(res.status, path).toBe(401);
      expect(res.body, path).toMatchObject(errorShape("UNAUTHORIZED"));
    }
  });

  it("rejects an unknown body field with INVALID_INPUT and field details", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/medications", { ...metformin, hacker: true }).expect(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(res.body.error.details).toEqual([expect.objectContaining({ reason: expect.stringContaining("hacker") })]);
  });

  it("rejects unknown fields when creating a circle (no mass assignment of role-like data)", async () => {
    const { app } = makeContext();
    const user = await signedUpClient(app, "Kamala");
    const res = await user.post("/circles", { ...newCircle, passcodeHash: "x" }).expect(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    const signup = await client(app).post("/auth/signup", { name: "Eve", email: "eve@example.com", password: PASSWORD, id: "usr_x", sessionVersion: 99 });
    expect(signup.status).toBe(400);
  });

  it("rejects malformed JSON with 400 INVALID_INPUT", async () => {
    const { app } = makeContext();
    const res = await request(app)
      .post("/api/v1/circles")
      .set("X-Requested-With", "hearth")
      .set("Content-Type", "application/json")
      .send('{"elderName": ');
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
  });

  it("rejects bodies over 100 KB with 413 PAYLOAD_TOO_LARGE", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/medications", { ...metformin, instructions: "x".repeat(120_000) }).expect(413);
    expect(res.body).toMatchObject(errorShape("PAYLOAD_TOO_LARGE"));
  });

  it("returns 404 NOT_FOUND in the contract shape for unknown API routes", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.get("/does-not-exist").expect(404);
    expect(res.body).toMatchObject(errorShape("NOT_FOUND"));
  });

  it("rejects a malformed query with INVALID_INPUT", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.get("/doses?date=15-11-2026").expect(400);
    await elder.get("/adherence?days=0").expect(400);
    await elder.get("/adherence?days=31").expect(400);
    await elder.get("/activity?limit=101").expect(400);
    await elder.get("/appointments?scope=sometime").expect(400);
  });
});

describe("session cookie", () => {
  const signup = (app: ReturnType<typeof makeContext>["app"]) =>
    request(app)
      .post("/api/v1/auth/signup")
      .set("X-Requested-With", "hearth")
      .send({ name: "Kamala", email: "kamala@example.com", password: PASSWORD });
  const cookieOf = (res: { headers: Record<string, unknown> }) => (res.headers["set-cookie"] as string[])[0]!.split(";")[0]!;

  /** A genuine session cookie for a user who has created a circle. */
  async function signedInCookie(app: ReturnType<typeof makeContext>["app"]): Promise<string> {
    const cookie = cookieOf(await signup(app).expect(201));
    const res = await request(app).post("/api/v1/circles").set("X-Requested-With", "hearth").set("Cookie", cookie).send(newCircle).expect(201);
    return cookieOf(res);
  }

  it("is httpOnly and SameSite=Lax", async () => {
    const { app } = makeContext();
    const res = await signup(app).expect(201);
    const header = (res.headers["set-cookie"] as unknown as string[])[0]!;
    expect(header).toMatch(/^hearth_session=/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(res.body.token).toBeUndefined();
  });

  it("accepts the genuine cookie", async () => {
    const { app } = makeContext();
    const cookie = await signedInCookie(app);
    await request(app).get("/api/v1/session").set("Cookie", cookie).expect(200);
  });

  it("rejects a tampered cookie", async () => {
    const { app } = makeContext();
    const cookie = await signedInCookie(app);
    const tampered = `${cookie.slice(0, -3)}${cookie.endsWith("aaa") ? "bbb" : "aaa"}`;
    const res = await request(app).get("/api/v1/session").set("Cookie", tampered);
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
  });

  it("rejects an arbitrary cookie value and clears it", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/api/v1/medications").set("Cookie", "hearth_session=not-a-token");
    expect(res.status).toBe(401);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/hearth_session=;/);
  });

  it("rejects a validly signed token from another deployment secret", async () => {
    const a = makeContext({ env: { SESSION_SECRET: "a".repeat(40) } });
    const b = makeContext({ env: { SESSION_SECRET: "b".repeat(40) } });
    const cookie = await signedInCookie(a.app);
    await request(b.app).get("/api/v1/session").set("Cookie", cookie).expect(401);
  });

  it("POST /auth/logout clears the cookie", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/auth/logout").expect(204);
    expect((res.headers["set-cookie"] as unknown as string[])[0]).toMatch(/hearth_session=;/);
    await elder.get("/session").expect(401);
  });
});

describe("cross-circle isolation", () => {
  async function twoCircles() {
    const ctx = makeContext();
    const a = await elderClient(ctx.app);
    const b = await signedUpClient(ctx.app, "Other");
    await b.post("/circles", { ...newCircle, elderName: "Other Elder" }).expect(201);
    return { ...ctx, a: a.elder, b };
  }

  it("hides another circle's medication from read, update, delete and dose logging", async () => {
    const { a, b } = await twoCircles();
    const med = (await a.post("/medications", metformin).expect(201)).body;

    const patch = await b.patch(`/medications/${med.id}`, { name: "Hijacked" }).expect(404);
    expect(patch.body).toMatchObject(errorShape("NOT_FOUND"));
    await b.delete(`/medications/${med.id}`).expect(404);
    await b.post(`/doses/${med.id}_2026-11-15_0800/log`, { status: "taken" }).expect(404);

    expect((await b.get("/medications").expect(200)).body.medications).toEqual([]);
    expect((await b.get("/doses?date=2026-11-15").expect(200)).body.doses).toEqual([]);

    const after = (await a.get("/medications").expect(200)).body.medications;
    expect(after).toHaveLength(1);
    expect(after[0]).toMatchObject({ name: "Metformin", stock: 6, active: true });
  });

  it("hides another circle's appointment from read, update, delete and ICS download", async () => {
    const { a, b } = await twoCircles();
    const apt = (await a.post("/appointments", appointment).expect(201)).body;

    await b.get(`/appointments/${apt.id}/ics`).expect(404);
    await b.patch(`/appointments/${apt.id}`, { doctorName: "Hijacked" }).expect(404);
    await b.delete(`/appointments/${apt.id}`).expect(404);

    expect((await b.get("/appointments?scope=all").expect(200)).body.appointments).toEqual([]);
    const after = (await a.get("/appointments?scope=all").expect(200)).body.appointments;
    expect(after).toHaveLength(1);
    expect(after[0].doctorName).toBe("Dr. Rao");
  });

  it("does not leak members, activity or notifications across circles", async () => {
    const { a, b } = await twoCircles();
    await a.post("/medications", metformin).expect(201);
    const members = (await b.get("/members").expect(200)).body.members;
    expect(members.map((m: { name: string }) => m.name)).toEqual(["Other"]);
    const activity = (await b.get("/activity").expect(200)).body.activity;
    expect(JSON.stringify(activity)).not.toContain("Metformin");
  });

  it("cannot remove a member of another circle", async () => {
    const { a, b } = await twoCircles();
    const kamala = (await a.get("/members").expect(200)).body.members[0];
    await b.delete(`/members/${kamala.id}`).expect(404);
    expect((await a.get("/members").expect(200)).body.members).toHaveLength(1);
  });
});

describe("membership rules", () => {
  it("forbids a family member from removing anyone", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    const kamala = (await elder.get("/members").expect(200)).body.members.find((m: { role: string }) => m.role === "elder");

    const res = await family.delete(`/members/${kamala.id}`).expect(403);
    expect(res.body).toMatchObject(errorShape("FORBIDDEN"));
    expect((await elder.get("/members").expect(200)).body.members).toHaveLength(2);
  });

  it("forbids a caretaker from removing anyone while an elder exists", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const nurse = await joinClient(app, code, "Nurse Joy", "caretaker", "nurse.joy@example.com");
    const family = await joinClient(app, code, "Ananya", "family");
    const members = (await elder.get("/members").expect(200)).body.members;
    const target = members.find((m: { name: string }) => m.name === "Ananya");
    await nurse.delete(`/members/${target.id}`).expect(403);
    await family.get("/session").expect(200);
  });

  it("lets the elder remove a family member, whose access to the circle then stops immediately", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await family.get("/session").expect(200);

    const target = (await elder.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await elder.delete(`/members/${target.id}`).expect(204);

    // Still signed in as a person, but the circle no longer resolves: choose-a-circle conflict, never data.
    const res = await family.get("/session").expect(409);
    expect(res.body).toMatchObject(errorShape("CONFLICT"));
    await family.get("/medications").expect(409);
    await family.get("/members").expect(409);
    await family.post("/medications", metformin).expect(409);
    await family.get("/auth/me").expect(200);
  });

  it("returns 404 when removing an unknown member", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.delete("/members/mem_missing").expect(404);
  });

  it("does not let the elder remove themselves", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const me = (await elder.get("/session").expect(200)).body.member;
    const res = await elder.delete(`/members/${me.id}`).expect(409);
    expect(res.body).toMatchObject(errorShape("CONFLICT"));
    await elder.get("/session").expect(200);
  });

  it("lets a caretaker manage the circle only while no elder has joined", async () => {
    const { app } = makeContext();
    const helper = await signedUpClient(app, "Nurse Joy", "nurse.joy@example.com");
    await helper.post("/circles", { ...newCircle, role: "caretaker" }).expect(201);
    const code = (await helper.get("/session").expect(200)).body.circle.code as string;
    const family = await joinClient(app, code, "Ananya", "family");
    const target = (await helper.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await helper.delete(`/members/${target.id}`).expect(204);
    await family.get("/session").expect(409);

    // Once an elder joins, the caretaker loses management rights.
    const elder = await joinClient(app, code, "Kamala", "elder");
    await elder.get("/session").expect(200);
    const members = (await elder.get("/members").expect(200)).body.members;
    const kamala = members.find((m: { role: string }) => m.role === "elder");
    await helper.delete(`/members/${kamala.id}`).expect(403);
    await helper.post("/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "brand-new-pass" }).expect(403);
  });

  it("refuses a second elder (a different account)", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const impostor = await signedUpClient(app, "Someone Else", "someone.else@example.com");
    const res = await impostor.post("/circles/join", { code, passcode: PASSCODE, role: "elder" }).expect(403);
    expect(res.body).toMatchObject(errorShape("FORBIDDEN"));
    await impostor.get("/session").expect(409);
  });

  it("lets the existing elder sign in again from another device without creating a second member", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const phone = client(app);
    await phone.post("/auth/login", { email: "KAMALA@example.com", password: PASSWORD }).expect(200);
    const res = await phone.post("/circles/join", { code, passcode: PASSCODE, role: "elder" }).expect(200);
    expect(res.body.member.name).toBe("Kamala");
    const members = (await phone.get("/members").expect(200)).body.members;
    expect(members).toHaveLength(1);
  });

  it("answers wrong code and wrong passcode identically", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const user = await signedUpClient(app, "Ananya");
    const wrongPass = await user.post("/circles/join", { role: "family", code, passcode: "nope-nope" }).expect(401);
    const wrongCode = await user.post("/circles/join", { role: "family", code: "CEDAR-0000", passcode: PASSCODE }).expect(401);
    expect(wrongCode.body).toEqual(wrongPass.body);
  });
});

describe("passcode change", () => {
  it("keeps existing members signed in, blocks joins with the old passcode and admits the new one", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await family.get("/session").expect(200);

    await elder.post("/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "brand-new-pass" }).expect(204);

    // Existing members keep access, on the same cookie.
    await family.get("/session").expect(200);
    await family.get("/medications").expect(200);
    await elder.get("/session").expect(200);

    const newcomer = await signedUpClient(app, "Ravi");
    await newcomer.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(401);
    await newcomer.get("/session").expect(409);
    await newcomer.post("/circles/join", { code, passcode: "brand-new-pass", role: "family" }).expect(200);
    await newcomer.get("/session").expect(200);
  });

  it("requires the current passcode", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/circles/passcode", { currentPasscode: "wrong-pass", newPasscode: "brand-new-pass" }).expect(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(res.body.error.details[0].field).toBe("currentPasscode");
  });

  it("validates the new passcode length", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "short" }).expect(400);
  });

  it("is forbidden for family members", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await family.post("/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "brand-new-pass" }).expect(403);
  });
});

describe("job endpoint", () => {
  it("rejects a missing token", async () => {
    const { app } = makeContext();
    const res = await request(app).post("/api/v1/jobs/reminders");
    expect(res.status).toBe(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
  });

  it.each(["wrong-token", "x".repeat(JOB_TOKEN.length), `${JOB_TOKEN}extra`, JOB_TOKEN.slice(0, -1)])(
    "rejects an incorrect token %j",
    async (token) => {
      const { app } = makeContext();
      await request(app).post("/api/v1/jobs/reminders").set("X-Job-Token", token).expect(401);
    },
  );

  it("is not reachable with a member session cookie alone", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/jobs/reminders", {}).expect(401);
  });

  it("accepts the correct token and reports totals", async () => {
    const { app } = makeContext();
    await elderClient(app);
    const res = await request(app).post("/api/v1/jobs/reminders").set("X-Job-Token", JOB_TOKEN).expect(200);
    expect(res.body).toEqual({ circles: 1, sent: 0, skipped: 0 });
  });

  it("is disabled when the server has no job token configured", async () => {
    const ctx = makeContext();
    ctx.deps.config.JOB_TOKEN = undefined;
    await request(ctx.app).post("/api/v1/jobs/reminders").set("X-Job-Token", "").expect(401);
    await request(ctx.app).post("/api/v1/jobs/reminders").expect(401);
  });
});

describe("response hardening", () => {
  it("sets security headers on /health", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/health").expect(200);
    expect(res.body).toMatchObject({ status: "ok", version: expect.any(String) });
    const csp = res.headers["content-security-policy"] as string;
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBeDefined();
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["permissions-policy"]).toContain("geolocation=()");
  });

  it("does not advertise the framework", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("marks API responses as non-cacheable", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/api/v1/session");
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("reports readiness", async () => {
    const { app } = makeContext();
    await request(app).get("/ready").expect(200, { status: "ready" });
  });

  it("reports unreadiness when the store is down", async () => {
    const ctx = makeContext();
    ctx.deps.store.ping = async () => false;
    await request(ctx.app).get("/ready").expect(503, { status: "unavailable" });
  });

  it("never includes stack traces or internals in error responses", async () => {
    const exploding: AiClient = {
      ...createLocalAiClient(),
      scanPrescription: async () => {
        throw new Error("secret database password is hunter2 at /srv/app/src/internal.ts:42");
      },
    };
    const ctx = makeContext({ ai: exploding });
    const { elder } = await elderClient(ctx.app);

    const responses = [
      await elder.post("/medications", { bogus: 1 }),
      await elder.get("/nope"),
      await elder.delete("/medications/med_missing"),
      await request(ctx.app).get("/api/v1/session"),
      await elder.post("/ai/prescription-scan", { imageBase64: "A".repeat(64), mimeType: "image/png" }),
    ];
    expect(responses.map((r) => r.status)).toEqual([400, 404, 404, 401, 500]);
    for (const res of responses) {
      const text = JSON.stringify(res.body);
      expect(text).not.toMatch(/stack|\.ts:\d+|node_modules|hunter2/i);
      expect(Object.keys(res.body)).toEqual(["error"]);
    }
    expect(responses[4]!.body.error.code).toBe("INTERNAL");
  });

  it("does not leak details when the AI provider is down", async () => {
    const down: AiClient = {
      ...createLocalAiClient(),
      scanPrescription: async () => {
        throw new AiUnavailableError("upstream 10.0.0.5 refused");
      },
    };
    const ctx = makeContext({ ai: down });
    const { elder } = await elderClient(ctx.app);
    const res = await elder.post("/ai/prescription-scan", { imageBase64: "A".repeat(64), mimeType: "image/png" }).expect(503);
    expect(JSON.stringify(res.body)).not.toContain("10.0.0.5");
  });
});
