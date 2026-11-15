import { SignJWT } from "jose";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hashPasscode, verifyPasscode } from "../src/auth/passcode.js";
import { createSessionSigner, SESSION_TTL_SECONDS } from "../src/auth/session.js";

describe("passcode hashing", () => {
  it("verifies the correct passcode", async () => {
    const hash = await hashPasscode("sunrise-42");
    expect(await verifyPasscode("sunrise-42", hash)).toBe(true);
  });

  it("rejects a wrong passcode", async () => {
    const hash = await hashPasscode("sunrise-42");
    expect(await verifyPasscode("sunrise-43", hash)).toBe(false);
    expect(await verifyPasscode("", hash)).toBe(false);
  });

  it("never stores the passcode in the hash", async () => {
    const hash = await hashPasscode("sunrise-42");
    expect(hash.startsWith("scrypt$")).toBe(true);
    expect(hash).not.toContain("sunrise-42");
  });

  it("produces different hashes for the same passcode (random salt)", async () => {
    const [a, b] = await Promise.all([hashPasscode("same-passcode"), hashPasscode("same-passcode")]);
    expect(a).not.toBe(b);
    expect(await verifyPasscode("same-passcode", a)).toBe(true);
    expect(await verifyPasscode("same-passcode", b)).toBe(true);
  });

  it("treats visually equivalent unicode forms as the same passcode", async () => {
    const hash = await hashPasscode("café-pass"); // precomposed
    expect(await verifyPasscode("café-pass", hash)).toBe(true); // decomposed
  });

  it.each(["", "not-a-hash", "bcrypt$1$2$3$salt$key", "scrypt$16384$8$1$onlysalt", "scrypt$$$$$"])(
    "returns false for malformed stored hash %j",
    async (stored) => {
      expect(await verifyPasscode("anything", stored)).toBe(false);
    },
  );
});

describe("session signer", () => {
  const secret = "a-secret-that-is-at-least-32-characters-long";
  const claims = { userId: "usr_1", circleId: "cir_1", version: 3 };

  afterEach(() => {
    vi.useRealTimers();
  });

  it("round-trips claims", async () => {
    const signer = createSessionSigner(secret);
    expect(await signer.verify(await signer.sign(claims))).toEqual(claims);
  });

  it("rejects a tampered token", async () => {
    const signer = createSessionSigner(secret);
    const token = await signer.sign(claims);
    const [header, payload, signature] = token.split(".");
    const forgedPayload = Buffer.from(JSON.stringify({ sub: "usr_2", cid: "cir_1", v: 3, iss: "hearth" })).toString("base64url");
    expect(await signer.verify(`${header}.${forgedPayload}.${signature}`)).toBeNull();
    expect(await signer.verify(`${header}.${payload}.${signature!.slice(0, -2)}xx`)).toBeNull();
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await createSessionSigner(secret).sign(claims);
    expect(await createSessionSigner("another-secret-that-is-also-32-chars!!").verify(token)).toBeNull();
  });

  it("rejects garbage input", async () => {
    const signer = createSessionSigner(secret);
    expect(await signer.verify("")).toBeNull();
    expect(await signer.verify("not.a.jwt")).toBeNull();
  });

  it("rejects an expired token", async () => {
    vi.useFakeTimers({ now: new Date("2026-11-15T00:00:00Z") });
    const signer = createSessionSigner(secret);
    const token = await signer.sign(claims);

    vi.setSystemTime(new Date(Date.now() + (SESSION_TTL_SECONDS - 60) * 1000));
    expect(await signer.verify(token)).toEqual(claims);

    vi.setSystemTime(new Date(Date.now() + 120 * 1000));
    expect(await signer.verify(token)).toBeNull();
  });

  it("rejects tokens from another issuer or with missing claims", async () => {
    const key = new TextEncoder().encode(secret);
    const signer = createSessionSigner(secret);
    const foreignIssuer = await new SignJWT({ cid: "cir_1", v: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("mem_1")
      .setIssuer("someone-else")
      .setExpirationTime("1h")
      .sign(key);
    const noCircle = await new SignJWT({ v: 1 })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject("mem_1")
      .setIssuer("hearth")
      .setExpirationTime("1h")
      .sign(key);
    expect(await signer.verify(foreignIssuer)).toBeNull();
    expect(await signer.verify(noCircle)).toBeNull();
  });

  it("rejects tokens using a different algorithm", async () => {
    const key = new TextEncoder().encode(secret);
    const hs512 = await new SignJWT({ cid: "cir_1", v: 1 })
      .setProtectedHeader({ alg: "HS512" })
      .setSubject("mem_1")
      .setIssuer("hearth")
      .setExpirationTime("1h")
      .sign(key);
    expect(await createSessionSigner(secret).verify(hs512)).toBeNull();
  });
});
