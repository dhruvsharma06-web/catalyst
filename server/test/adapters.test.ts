import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pino } from "pino";
import request from "supertest";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { createLogMailer, createSmtpMailer, maskEmail } from "../src/adapters/mailer.js";
import { makeContext } from "./helpers.js";

describe("maskEmail", () => {
  it("keeps only the first letter and the domain", () => {
    expect(maskEmail("ananya@example.com")).toBe("a***@example.com");
  });

  it("handles single-character local parts", () => {
    expect(maskEmail("a@example.com")).toBe("a***@example.com");
  });
});

describe("mailers", () => {
  it("log transport reports its transport and records only a masked address", async () => {
    const lines: string[] = [];
    const logger = pino({ level: "info" }, { write: (line: string) => void lines.push(line) });
    const mailer = createLogMailer(logger);
    expect(mailer.transport).toBe("log");
    await mailer.send({ to: "ananya@example.com", subject: "Hello", text: "secret body", html: "<p>secret body</p>" });
    const logged = lines.join("");
    expect(logged).toContain("a***@example.com");
    expect(logged).not.toContain("ananya@example.com");
    expect(logged).not.toContain("secret body");
  });

  it("smtp transport reports its transport", () => {
    const mailer = createSmtpMailer({ host: "smtp.invalid", port: 465, user: "u", pass: "p", from: "Hearth <a@b.c>" });
    expect(mailer.transport).toBe("smtp");
  });

  it("smtp transport surfaces delivery failures to the caller", async () => {
    const mailer = createSmtpMailer({ host: "127.0.0.1", port: 1, from: "Hearth <a@b.c>" });
    await expect(mailer.send({ to: "x@example.com", subject: "s", text: "t", html: "<p>t</p>" })).rejects.toThrow();
  });
});

describe("static web app", () => {
  let dir: string;
  beforeAll(() => {
    dir = mkdtempSync(path.join(tmpdir(), "hearth-web-"));
    mkdirSync(path.join(dir, "assets"));
    writeFileSync(path.join(dir, "index.html"), "<!doctype html><title>Hearth</title>");
    writeFileSync(path.join(dir, "assets", "app.js"), "console.log(1)");
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("serves the app shell for client-side routes without caching", async () => {
    const app = createApp(makeContext().deps, { webDist: dir });
    const res = await request(app).get("/app/medications").expect(200);
    expect(res.text).toContain("<title>Hearth</title>");
    expect(res.headers["cache-control"]).toBe("no-cache");
  });

  it("serves hashed assets as immutable", async () => {
    const app = createApp(makeContext().deps, { webDist: dir });
    const res = await request(app).get("/assets/app.js").expect(200);
    expect(res.headers["cache-control"]).toContain("immutable");
  });

  it("returns a JSON 404 for a missing asset instead of the app shell", async () => {
    const app = createApp(makeContext().deps, { webDist: dir });
    const res = await request(app).get("/assets/missing.js").expect(404);
    expect(res.body.error.code).toBe("NOT_FOUND");
  });

  it("never serves the app shell for unknown API paths", async () => {
    const app = createApp(makeContext().deps, { webDist: dir });
    const res = await request(app).get("/api/v1/session").expect(401);
    expect(res.body.error.code).toBe("UNAUTHORIZED");
  });

  it("serves no web content when no build exists", async () => {
    const app = createApp(makeContext().deps, { webDist: path.join(dir, "nope") });
    await request(app).get("/app").expect(404);
  });
});
