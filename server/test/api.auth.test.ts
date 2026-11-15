import { SignJWT } from "jose";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { MAX_FAILED_LOGINS_PER_HOUR } from "../src/services/account.js";
import { client, elderClient, joinClient, makeContext, metformin, newCircle, PASSCODE, PASSWORD, signedUpClient } from "./helpers.js";

/** The Set-Cookie headers of a response as an array (supertest types them loosely). */
const cookies = (res: { headers: Record<string, unknown> }): string[] => {
  const raw = res.headers["set-cookie"];
  return Array.isArray(raw) ? raw.map(String) : raw ? [String(raw)] : [];
};

const errorShape = (code: string) => ({ error: { code, message: expect.any(String), details: expect.any(Array) } });
const signupBody = { name: "Ananya", email: "ananya@example.com", password: PASSWORD };
const noSecrets = (body: unknown) => expect(JSON.stringify(body)).not.toMatch(/passwordHash|passcodeHash|sessionVersion|scrypt\$/);

const cookieOf = (res: { headers: Record<string, unknown> }) => cookies(res)[0]!.split(";")[0]!;
const post = (app: Parameters<typeof request>[0], path: string, body: object) =>
  request(app).post(`/api/v1${path}`).set("X-Requested-With", "hearth").send(body);

describe("signup", () => {
  it("creates the account, sets the session cookie and returns the Account shape", async () => {
    const { app } = makeContext();
    const res = await post(app, "/auth/signup", signupBody).expect(201);
    expect(res.body).toEqual({
      user: { id: expect.stringMatching(/^usr_/), name: "Ananya", email: "ananya@example.com", createdAt: expect.any(String) },
      circles: [],
      active: null,
    });
    const header = cookies(res)[0]!;
    expect(header).toMatch(/^hearth_session=[\w-]+\.[\w-]+\.[\w-]+;/);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(/SameSite=Lax/i);
    expect(res.body.token).toBeUndefined();
    noSecrets(res.body);
  });

  it("never exposes a password hash or password in any response", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    const bodies: unknown[] = [];
    for (const c of [elder, family]) {
      bodies.push((await c.get("/auth/me").expect(200)).body);
      bodies.push((await c.get("/session").expect(200)).body);
      bodies.push((await c.get("/members").expect(200)).body);
      bodies.push((await c.get("/activity").expect(200)).body);
    }
    bodies.push((await client(app).post("/auth/login", { email: "kamala@example.com", password: PASSWORD }).expect(200)).body);
    bodies.push((await client(app).post("/auth/login", { email: "kamala@example.com", password: "wrong-wrong-wrong" }).expect(401)).body);
    bodies.push((await post(app, "/auth/signup", signupBody).expect(409)).body);
    for (const body of bodies) {
      noSecrets(body);
      expect(JSON.stringify(body)).not.toContain(PASSWORD);
    }
  });

  it("stores the password as a salted scrypt hash, never in clear", async () => {
    const ctx = makeContext();
    await post(ctx.app, "/auth/signup", signupBody).expect(201);
    await post(ctx.app, "/auth/signup", { ...signupBody, email: "other@example.com" }).expect(201);
    const a = await ctx.deps.store.users.findByEmail("ananya@example.com");
    const b = await ctx.deps.store.users.findByEmail("other@example.com");
    expect(a!.passwordHash.startsWith("scrypt$")).toBe(true);
    expect(a!.passwordHash).not.toContain(PASSWORD);
    expect(a!.passwordHash).not.toBe(b!.passwordHash);
  });

  it("rejects a duplicate email regardless of case", async () => {
    const { app } = makeContext();
    await post(app, "/auth/signup", signupBody).expect(201);
    const res = await post(app, "/auth/signup", { ...signupBody, name: "Someone Else", email: "ANANYA@Example.COM" }).expect(409);
    expect(res.body).toMatchObject(errorShape("CONFLICT"));
    expect(res.headers["set-cookie"]).toBeUndefined();
    // The original password still works, so the duplicate attempt did not overwrite the account.
    await post(app, "/auth/login", { email: "ananya@example.com", password: PASSWORD }).expect(200);
  });

  it("rejects a password shorter than 10 characters with field details", async () => {
    const { app } = makeContext();
    const res = await post(app, "/auth/signup", { ...signupBody, password: "123456789" }).expect(400);
    expect(res.body).toMatchObject(errorShape("INVALID_INPUT"));
    expect(res.body.error.details).toEqual([expect.objectContaining({ field: "password" })]);
    await post(app, "/auth/signup", { ...signupBody, password: "1234567890" }).expect(201);
  });

  it.each([
    ["bad email", { email: "not-an-email" }, "email"],
    ["blank name", { name: "  " }, "name"],
    ["overlong name", { name: "x".repeat(61) }, "name"],
    ["overlong password", { password: "p".repeat(129) }, "password"],
  ])("rejects %s", async (_label, override, field) => {
    const { app } = makeContext();
    const res = await post(app, "/auth/signup", { ...signupBody, ...override }).expect(400);
    expect(res.body.error.details.map((d: { field: string }) => d.field)).toContain(field);
  });

  it("rejects unknown fields (no mass assignment of account data)", async () => {
    const { app } = makeContext();
    await post(app, "/auth/signup", { ...signupBody, passwordHash: "x", sessionVersion: 9 }).expect(400);
  });

  it("requires the CSRF header", async () => {
    const { app } = makeContext();
    await request(app).post("/api/v1/auth/signup").send(signupBody).expect(403);
  });
});

describe("login", () => {
  it("signs in with the right credentials, ignoring email case, and returns the circles", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const phone = client(app);
    const res = await phone.post("/auth/login", { email: "Kamala@EXAMPLE.com", password: PASSWORD }).expect(200);
    expect(res.body.user).toMatchObject({ name: "Kamala", email: "kamala@example.com" });
    expect(res.body.circles).toEqual([{ circle: expect.objectContaining({ code, elderName: "Kamala Iyer" }), role: "elder" }]);
    expect(res.body.active).toBeNull();
    await phone.get("/auth/me").expect(200);
  });

  it("answers a wrong password and an unknown email with the same 401", async () => {
    const { app } = makeContext();
    await post(app, "/auth/signup", signupBody).expect(201);
    const wrongPassword = await post(app, "/auth/login", { email: "ananya@example.com", password: "wrong-wrong-wrong" }).expect(401);
    const unknownEmail = await post(app, "/auth/login", { email: "nobody@example.com", password: PASSWORD }).expect(401);
    expect(wrongPassword.body).toMatchObject(errorShape("UNAUTHORIZED"));
    expect(unknownEmail.body).toEqual(wrongPassword.body);
    expect(wrongPassword.headers["set-cookie"]).toBeUndefined();
    expect(unknownEmail.headers["set-cookie"]).toBeUndefined();
  });

  it("locks the account after 10 failures in an hour, even with the right password and from other clients", async () => {
    const { app } = makeContext();
    await post(app, "/auth/signup", signupBody).expect(201);
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_HOUR; i++) {
      await post(app, "/auth/login", { email: "ananya@example.com", password: `wrong-password-${i}` }).expect(401);
    }
    const locked = await post(app, "/auth/login", { email: "ananya@example.com", password: PASSWORD }).expect(429);
    expect(locked.body).toMatchObject(errorShape("RATE_LIMITED"));
    expect(locked.headers["set-cookie"]).toBeUndefined();
    await post(app, "/auth/login", { email: "ANANYA@example.com", password: PASSWORD }).expect(429);
  });

  it("does not lock other accounts, and the lock lifts when the hour rolls over", async () => {
    const ctx = makeContext();
    await post(ctx.app, "/auth/signup", signupBody).expect(201);
    await post(ctx.app, "/auth/signup", { ...signupBody, email: "other@example.com" }).expect(201);
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_HOUR; i++) {
      await post(ctx.app, "/auth/login", { email: "ananya@example.com", password: "wrong-wrong-wrong" }).expect(401);
    }
    await post(ctx.app, "/auth/login", { email: "other@example.com", password: PASSWORD }).expect(200);
    await post(ctx.app, "/auth/login", { email: "ananya@example.com", password: PASSWORD }).expect(429);
    ctx.clock.now = new Date("2026-11-15T07:05:00Z");
    await post(ctx.app, "/auth/login", { email: "ananya@example.com", password: PASSWORD }).expect(200);
  });

  it("does not count failures against unknown emails (no account to lock)", async () => {
    const { app } = makeContext();
    for (let i = 0; i < MAX_FAILED_LOGINS_PER_HOUR + 2; i++) {
      await post(app, "/auth/login", { email: "ghost@example.com", password: PASSWORD }).expect(401);
    }
  });

  it("validates the body", async () => {
    const { app } = makeContext();
    await post(app, "/auth/login", { email: "nope", password: PASSWORD }).expect(400);
    await post(app, "/auth/login", { email: "a@example.com", password: "" }).expect(400);
    await post(app, "/auth/login", { email: "a@example.com", password: PASSWORD, extra: 1 }).expect(400);
  });
});

describe("GET /auth/me and logout", () => {
  it("returns 401 without a cookie", async () => {
    const { app } = makeContext();
    const res = await request(app).get("/api/v1/auth/me").expect(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
  });

  it("returns the account, its circles and the active context with a cookie", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const res = await elder.get("/auth/me").expect(200);
    expect(res.body.user).toMatchObject({ name: "Kamala", email: "kamala@example.com" });
    expect(res.body.circles).toEqual([{ circle: expect.objectContaining({ code }), role: "elder" }]);
    expect(res.body.active).toMatchObject({ circle: { code }, member: { name: "Kamala", role: "elder", id: res.body.user.id } });
    noSecrets(res.body);
  });

  it("logout clears the cookie, after which the session is gone", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/auth/logout").expect(204);
    expect(cookies(res)[0]).toMatch(/hearth_session=;/);
    expect((await elder.get("/auth/me").expect(401)).body).toMatchObject(errorShape("UNAUTHORIZED"));
    await elder.get("/medications").expect(401);
  });

  it("logout is harmless when not signed in", async () => {
    const { app } = makeContext();
    await post(app, "/auth/logout", {}).expect(204);
  });
});

describe("session tokens", () => {
  it("rejects a tampered token and clears the cookie", async () => {
    const { app } = makeContext();
    const cookie = cookieOf(await post(app, "/auth/signup", signupBody).expect(201));
    await request(app).get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
    const tampered = `${cookie.slice(0, -3)}${cookie.endsWith("aaa") ? "bbb" : "aaa"}`;
    const res = await request(app).get("/api/v1/auth/me").set("Cookie", tampered).expect(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
    expect(cookies(res)[0]).toMatch(/hearth_session=;/);
  });

  it("rejects a payload swapped to another user while keeping the original signature", async () => {
    const { app } = makeContext();
    const a = cookieOf(await post(app, "/auth/signup", signupBody).expect(201));
    const b = cookieOf(await post(app, "/auth/signup", { ...signupBody, email: "b@example.com" }).expect(201));
    const [header, , signature] = a.replace("hearth_session=", "").split(".");
    const payloadOfB = b.split(".")[1];
    await request(app).get("/api/v1/auth/me").set("Cookie", `hearth_session=${header}.${payloadOfB}.${signature}`).expect(401);
  });

  it("rejects an expired token", async () => {
    const ctx = makeContext();
    const res = await post(ctx.app, "/auth/signup", signupBody).expect(201);
    const key = new TextEncoder().encode(ctx.deps.config.SESSION_SECRET);
    const sign = (exp: number) =>
      new SignJWT({ cid: null, v: 1 })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(res.body.user.id)
        .setIssuer("hearth")
        .setIssuedAt(Math.floor(Date.now() / 1000) - 7200)
        .setExpirationTime(exp)
        .sign(key);
    const expired = await sign(Math.floor(Date.now() / 1000) - 60);
    await request(ctx.app).get("/api/v1/auth/me").set("Cookie", `hearth_session=${expired}`).expect(401);
    // Control: the same claims with a future expiry are accepted, so only the expiry was at fault.
    const valid = await sign(Math.floor(Date.now() / 1000) + 600);
    await request(ctx.app).get("/api/v1/auth/me").set("Cookie", `hearth_session=${valid}`).expect(200);
  });

  it("rejects a token signed with another secret", async () => {
    const a = makeContext({ env: { SESSION_SECRET: "a".repeat(40) } });
    const b = makeContext({ env: { SESSION_SECRET: "b".repeat(40) } });
    const cookie = cookieOf(await post(a.app, "/auth/signup", signupBody).expect(201));
    await request(b.app).get("/api/v1/auth/me").set("Cookie", cookie).expect(401);
  });

  it("rejects a token for an account that no longer exists", async () => {
    const ctx = makeContext();
    const cookie = cookieOf(await post(ctx.app, "/auth/signup", signupBody).expect(201));
    const token = await ctx.deps.signer.sign({ userId: "usr_missing", circleId: null, version: 1 });
    await request(ctx.app).get("/api/v1/auth/me").set("Cookie", `hearth_session=${token}`).expect(401);
    await request(ctx.app).get("/api/v1/auth/me").set("Cookie", cookie).expect(200);
  });

  it("invalidates sessions when the account's session version changes (password change)", async () => {
    const ctx = makeContext();
    const user = await signedUpClient(ctx.app, "Ananya");
    await user.get("/auth/me").expect(200);
    const record = (await ctx.deps.store.users.findByEmail("ananya@example.com"))!;
    await ctx.deps.store.users.update(record.id, { sessionVersion: record.sessionVersion + 1 });
    await user.get("/auth/me").expect(401);
    await user.get("/medications").expect(401);
  });

  it("does not accept a bearer header or query-string token instead of the cookie", async () => {
    const { app } = makeContext();
    const cookie = cookieOf(await post(app, "/auth/signup", signupBody).expect(201));
    const token = cookie.replace("hearth_session=", "");
    await request(app).get("/api/v1/auth/me").set("Authorization", `Bearer ${token}`).expect(401);
    await request(app).get(`/api/v1/auth/me?token=${token}`).expect(401);
  });
});

describe("circles require an account", () => {
  it("refuses to create a circle when not signed in", async () => {
    const { app } = makeContext();
    const res = await post(app, "/circles", newCircle).expect(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
  });

  it("refuses to join a circle when not signed in, even with the right code and passcode", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const res = await post(app, "/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(401);
    expect(res.body).toMatchObject(errorShape("UNAUTHORIZED"));
  });

  it("refuses to switch circles or change the passcode when not signed in", async () => {
    const { app } = makeContext();
    await post(app, "/circles/active", { circleId: "cir_x" }).expect(401);
    await post(app, "/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "brand-new-pass" }).expect(401);
  });

  it("the legacy POST /session login no longer exists", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const user = await joinClient(app, code, "Ananya", "family");
    await user.post("/session", { code, passcode: PASSCODE, name: "Ananya", role: "family", email: null }).expect(404);
    await user.delete("/session").expect(404);
  });

  it("GET /session is 409 for a signed-in user without an active circle", async () => {
    const { app } = makeContext();
    const user = await signedUpClient(app, "Ananya");
    const res = await user.get("/session").expect(409);
    expect(res.body).toMatchObject(errorShape("CONFLICT"));
    for (const path of ["/members", "/medications", "/doses", "/appointments", "/activity", "/notifications", "/adherence", "/ai/care-summary"]) {
      await user.get(path).expect(409);
    }
    await user.post("/medications", metformin).expect(409);
  });

  it("creating a circle makes it active and records the account as the member", async () => {
    const { app } = makeContext();
    const user = await signedUpClient(app, "Ananya");
    const res = await user.post("/circles", { ...newCircle, role: "caretaker" }).expect(201);
    expect(res.body.member).toMatchObject({ name: "Ananya", role: "caretaker", email: "ananya@example.com" });
    const me = (await user.get("/auth/me").expect(200)).body;
    expect(res.body.member.id).toBe(me.user.id);
    expect(me.active.circle.id).toBe(res.body.circle.id);
    await user.get("/session").expect(200);
  });

  it("joining makes the circle active and uses the account's name and email", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const user = await signedUpClient(app, "Ananya");
    const res = await user.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    expect(res.body.member).toMatchObject({ name: "Ananya", email: "ananya@example.com", role: "family" });
    expect(res.body.circle.code).toBe(code);
    noSecrets(res.body);
  });
});

describe("multiple circles", () => {
  async function twoCircles() {
    const ctx = makeContext();
    const { elder: kamala, code: codeA } = await elderClient(ctx.app);
    const walt = await signedUpClient(ctx.app, "Walt");
    const b = await walt.post("/circles", { ...newCircle, elderName: "Walt Rivers", passcode: "walnut-77" }).expect(201);
    // Ananya belongs to both circles.
    const ananya = await joinClient(ctx.app, codeA, "Ananya", "family");
    const circleA = (await ananya.get("/session").expect(200)).body.circle.id as string;
    await ananya.post("/circles/join", { code: b.body.circle.code, passcode: "walnut-77", role: "caretaker" }).expect(200);
    const circleB = b.body.circle.id as string;
    return { ...ctx, kamala, walt, ananya, circleA, circleB, codeA };
  }

  it("lists every circle with the role in each", async () => {
    const { ananya, circleA, circleB } = await twoCircles();
    const me = (await ananya.get("/auth/me").expect(200)).body;
    expect(me.circles.map((c: { circle: { id: string }; role: string }) => [c.circle.id, c.role]).sort()).toEqual(
      [
        [circleA, "family"],
        [circleB, "caretaker"],
      ].sort(),
    );
    expect(me.circles.map((c: { circle: { elderName: string } }) => c.circle.elderName)).toEqual(["Kamala Iyer", "Walt Rivers"]);
    // The last joined circle is active.
    expect(me.active.circle.id).toBe(circleB);
  });

  it("switching the active circle changes the data scope; the other circle's data is not visible", async () => {
    const { kamala, walt, ananya, circleA, circleB } = await twoCircles();
    await kamala.post("/medications", { ...metformin, name: "OnlyInA" }).expect(201);
    await walt.post("/medications", { ...metformin, name: "OnlyInB" }).expect(201);

    // Active circle is B.
    let names = (await ananya.get("/medications").expect(200)).body.medications.map((m: { name: string }) => m.name);
    expect(names).toEqual(["OnlyInB"]);

    const toA = await ananya.post("/circles/active", { circleId: circleA }).expect(200);
    expect(toA.body.circle.id).toBe(circleA);
    expect(toA.body.member.role).toBe("family");
    names = (await ananya.get("/medications").expect(200)).body.medications.map((m: { name: string }) => m.name);
    expect(names).toEqual(["OnlyInA"]);
    expect(JSON.stringify((await ananya.get("/activity").expect(200)).body)).not.toContain("OnlyInB");
    expect((await ananya.get("/auth/me").expect(200)).body.active.circle.id).toBe(circleA);
    // Role is per circle: family in A cannot manage members.
    await ananya.delete("/members/anyone").expect(403);

    await ananya.post("/circles/active", { circleId: circleB }).expect(200);
    names = (await ananya.get("/medications").expect(200)).body.medications.map((m: { name: string }) => m.name);
    expect(names).toEqual(["OnlyInB"]);
  });

  it("refuses to activate a circle the user is not a member of, and keeps the current context", async () => {
    const { walt, kamala, circleA, circleB, ananya } = await twoCircles();
    const res = await walt.post("/circles/active", { circleId: circleA }).expect(403);
    expect(res.body).toMatchObject(errorShape("FORBIDDEN"));
    // Walt is still working in his own circle with unchanged data.
    expect((await walt.get("/session").expect(200)).body.circle.id).toBe(circleB);
    await kamala.post("/circles/active", { circleId: circleB }).expect(403);
    expect((await kamala.get("/session").expect(200)).body.circle.id).toBe(circleA);
    // Unknown ids are indistinguishable from other people's circles.
    await ananya.post("/circles/active", { circleId: "cir_does_not_exist" }).expect(403);
    await ananya.post("/circles/active", {}).expect(400);
    await ananya.post("/circles/active", { circleId: circleA, extra: true }).expect(400);
  });

  it("a user who has never been in a circle cannot activate any", async () => {
    const { circleA } = await twoCircles();
    const { app } = makeContext();
    const loner = await signedUpClient(app, "Loner");
    await loner.post("/circles/active", { circleId: circleA }).expect(403);
    await loner.get("/session").expect(409);
  });
});

describe("joining twice", () => {
  it("returns the same membership and creates no duplicate member or activity", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await signedUpClient(app, "Ananya");
    const first = await family.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    const second = await family.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    expect(second.body).toEqual(first.body);

    const members = (await elder.get("/members").expect(200)).body.members;
    expect(members).toHaveLength(2);
    expect(members.filter((m: { id: string }) => m.id === first.body.member.id)).toHaveLength(1);
    const joins = (await elder.get("/activity").expect(200)).body.activity.filter((a: { kind: string }) => a.kind === "member.joined");
    expect(joins).toHaveLength(1);
    expect((await family.get("/auth/me").expect(200)).body.circles).toHaveLength(1);
  });

  it("cannot upgrade a role by joining again", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const family = await signedUpClient(app, "Ananya");
    await family.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    const again = await family.post("/circles/join", { code, passcode: PASSCODE, role: "caretaker" }).expect(200);
    expect(again.body.member.role).toBe("family");
    await family.delete("/members/anyone").expect(403);
  });

  it("still requires the passcode when joining again", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await family.post("/circles/join", { code, passcode: "wrong-pass", role: "family" }).expect(401);
  });
});

describe("removing a member", () => {
  it("revokes their circle access immediately and drops the circle from their account", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    await elder.post("/medications", metformin).expect(201);
    await family.get("/medications").expect(200);
    expect((await family.get("/auth/me").expect(200)).body.circles).toHaveLength(1);

    const target = (await elder.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await elder.delete(`/members/${target.id}`).expect(204);

    // Same cookie, no re-login: every circle endpoint now refuses.
    for (const path of ["/session", "/members", "/medications", "/doses", "/activity", "/ai/care-summary"]) {
      const res = await family.get(path).expect(409);
      expect(res.body).toMatchObject(errorShape("CONFLICT"));
      expect(JSON.stringify(res.body)).not.toContain("Metformin");
    }
    await family.post("/medications", metformin).expect(409);
    await family.post("/circles/active", { circleId: (await elder.get("/session").expect(200)).body.circle.id }).expect(403);

    const me = (await family.get("/auth/me").expect(200)).body;
    expect(me.circles).toEqual([]);
    expect(me.active).toBeNull();
    // The elder still sees a healthy circle without them.
    expect((await elder.get("/members").expect(200)).body.members).toHaveLength(1);
  });

  it("allows the removed person to rejoin with the current passcode, as a fresh member", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const family = await joinClient(app, code, "Ananya", "family");
    const target = (await elder.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await elder.delete(`/members/${target.id}`).expect(204);
    await family.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(200);
    await family.get("/medications").expect(200);
    expect((await elder.get("/members").expect(200)).body.members).toHaveLength(2);
  });

  it("does not affect the removed person's other circles", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const ananya = await joinClient(app, code, "Ananya", "family");
    const own = await ananya.post("/circles", { ...newCircle, elderName: "Her Own Circle", passcode: "another-pass" }).expect(201);
    const target = (await elder.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await elder.delete(`/members/${target.id}`).expect(204);
    const me = (await ananya.get("/auth/me").expect(200)).body;
    expect(me.circles.map((c: { circle: { id: string } }) => c.circle.id)).toEqual([own.body.circle.id]);
    await ananya.get("/medications").expect(200);
  });

  it("revokes access even if the removed user's token pointed at that circle after a switch", async () => {
    const { app } = makeContext();
    const { elder, code } = await elderClient(app);
    const ananya = await joinClient(app, code, "Ananya", "family");
    const circleA = (await ananya.get("/session").expect(200)).body.circle.id as string;
    await ananya.post("/circles", { ...newCircle, elderName: "Other", passcode: "another-pass" }).expect(201);
    await ananya.post("/circles/active", { circleId: circleA }).expect(200);
    const target = (await elder.get("/members").expect(200)).body.members.find((m: { name: string }) => m.name === "Ananya");
    await elder.delete(`/members/${target.id}`).expect(204);
    await ananya.get("/members").expect(409);
    await ananya.post("/circles/active", { circleId: circleA }).expect(403);
  });
});

describe("cross-account isolation (IDOR)", () => {
  async function setup() {
    const ctx = makeContext();
    const a = await elderClient(ctx.app);
    const walt = await signedUpClient(ctx.app, "Walt");
    const b = await walt.post("/circles", { ...newCircle, elderName: "Walt Rivers", passcode: "walnut-77" }).expect(201);
    const med = (await a.elder.post("/medications", metformin).expect(201)).body;
    const apt = (
      await a.elder
        .post("/appointments", {
          doctorName: "Dr. Rao",
          specialty: "",
          location: "",
          startsAt: "2026-11-20T04:30:00.000Z",
          durationMinutes: 30,
          notes: "",
          reminderMinutesBefore: 60,
        })
        .expect(201)
    ).body;
    const circleA = (await a.elder.get("/session").expect(200)).body.circle.id as string;
    return { ...ctx, a: a.elder, codeA: a.code, walt, circleA, circleB: b.body.circle.id as string, med, apt };
  }

  it("cannot read another circle by forging circleId via POST /circles/active", async () => {
    const { walt, circleA, circleB } = await setup();
    await walt.post("/circles/active", { circleId: circleA }).expect(403);
    expect((await walt.get("/session").expect(200)).body.circle.id).toBe(circleB);
    expect((await walt.get("/medications").expect(200)).body.medications).toEqual([]);
  });

  it("cannot use a forged token claiming another circle (membership is re-checked)", async () => {
    const ctx = await setup();
    const waltId = (await ctx.walt.get("/auth/me").expect(200)).body.user.id as string;
    // Even a correctly signed token for Walt that names circle A is useless: he is not a member there.
    const forged = await ctx.deps.signer.sign({ userId: waltId, circleId: ctx.circleA, version: 1 });
    const res = await request(ctx.app).get("/api/v1/medications").set("Cookie", `hearth_session=${forged}`).expect(409);
    expect(JSON.stringify(res.body)).not.toContain("Metformin");
    await request(ctx.app).get("/api/v1/members").set("Cookie", `hearth_session=${forged}`).expect(409);
    const me = await request(ctx.app).get("/api/v1/auth/me").set("Cookie", `hearth_session=${forged}`).expect(200);
    expect(me.body.active).toBeNull();
  });

  it("cannot reach another circle's records through ids in URLs", async () => {
    const { walt, med, apt } = await setup();
    await walt.patch(`/medications/${med.id}`, { name: "Hijacked" }).expect(404);
    await walt.delete(`/medications/${med.id}`).expect(404);
    await walt.post(`/doses/${med.id}_2026-11-15_0800/log`, { status: "taken" }).expect(404);
    await walt.get(`/appointments/${apt.id}/ics`).expect(404);
    await walt.patch(`/appointments/${apt.id}`, { doctorName: "Hijacked" }).expect(404);
    await walt.delete(`/appointments/${apt.id}`).expect(404);
  });

  it("cannot remove, or see, members of another circle by id", async () => {
    const { walt, a } = await setup();
    const kamalaId = (await a.get("/members").expect(200)).body.members[0].id as string;
    await walt.delete(`/members/${kamalaId}`).expect(404);
    const members = (await walt.get("/members").expect(200)).body.members;
    expect(members.map((m: { name: string }) => m.name)).toEqual(["Walt"]);
    expect((await a.get("/members").expect(200)).body.members).toHaveLength(1);
  });

  it("cannot change another circle's passcode or join it with a guessed passcode", async () => {
    const { walt, codeA, circleA } = await setup();
    await walt.post("/circles/passcode", { currentPasscode: PASSCODE, newPasscode: "hijacked-pass" }).expect(400); // his own circle's passcode differs
    await walt.post("/circles/join", { code: codeA, passcode: "hijacked-pass", role: "family" }).expect(401);
    await walt.post("/circles/active", { circleId: circleA }).expect(403);
  });

  it("a member's own id is the account id, so another account cannot act as them", async () => {
    const { a, walt } = await setup();
    const kamala = (await a.get("/session").expect(200)).body.member;
    const waltMe = (await walt.get("/session").expect(200)).body.member;
    expect(kamala.id).not.toBe(waltMe.id);
    const res = await walt.patch("/members/me", { notify: { doses: false, missed: false, appointments: false } }).expect(200);
    expect(res.body.id).toBe(waltMe.id);
    expect((await a.get("/members").expect(200)).body.members[0].notify).toEqual({ doses: true, missed: true, appointments: true });
  });
});
