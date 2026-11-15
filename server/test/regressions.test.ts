import { describe, expect, it } from "vitest";
import { appointmentToIcs } from "../src/domain/ics.js";
import type { Appointment } from "../src/domain/types.js";
import { MAX_FAILED_JOINS_PER_HOUR } from "../src/services/circle.js";
import request from "supertest";
import { elderClient, JOB_TOKEN, makeContext, metformin, PASSCODE, signedUpClient } from "./helpers.js";

const appointment: Appointment = {
  id: "apt_1",
  doctorName: "Dr. A;B",
  specialty: "",
  location: "é".repeat(60),
  startsAt: "2026-11-20T05:00:00.000Z",
  durationMinutes: 30,
  notes: "",
  reminderMinutesBefore: 60,
  createdBy: "Kamala",
  updatedAt: "2026-11-15T05:00:00.000Z",
};

describe("regressions", () => {
  it("escapes semicolons in calendar text", () => {
    const ics = appointmentToIcs(appointment, "Kamala");
    expect(ics).toContain("SUMMARY:Kamala: Dr. A\\;B");
  });

  it("folds calendar lines by UTF-8 octets without splitting characters", () => {
    const ics = appointmentToIcs(appointment, "Kamala");
    for (const line of ics.split("\r\n")) {
      expect(Buffer.byteLength(line, "utf8")).toBeLessThanOrEqual(75);
      expect(line).not.toContain("�");
    }
    const unfolded = ics.replace(/\r\n /g, "");
    expect(unfolded).toContain(`LOCATION:${"é".repeat(60)}`);
  });

  it("rejects a partial update that puts the end date before the start date", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = await elder.post("/medications", metformin).expect(201);
    const res = await elder.patch(`/medications/${med.body.id}`, { endDate: "2026-10-01" }).expect(400);
    expect(res.body.error.details[0].field).toBe("endDate");
  });
});

describe("hardening", () => {
  it("locks a circle after repeated wrong passcodes, even from different clients", async () => {
    const { app } = makeContext();
    const { code } = await elderClient(app);
    const guesser = await signedUpClient(app, "Guess");
    const other = await signedUpClient(app, "Other");
    for (let i = 0; i < MAX_FAILED_JOINS_PER_HOUR; i++) {
      await guesser.post("/circles/join", { code, passcode: "wrong-pass", role: "family" }).expect(401);
    }
    // Even the correct passcode is refused until the hour rolls over, for every account.
    await guesser.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(429);
    await other.post("/circles/join", { code, passcode: PASSCODE, role: "family" }).expect(429);
  });

  it("rejects control characters in single-line fields", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/medications", { ...metformin, name: "Metformin\r\nBcc: x@evil.test" }).expect(400);
    expect(res.body.error.details[0].field).toBe("name");
  });

  it("rejects an image payload that is not base64", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", { imageBase64: "<<<not base64 at all>>>", mimeType: "image/png" }).expect(400);
  });
});

describe("scheduler authentication", () => {
  it("accepts the job token as a Bearer header on GET (Vercel Cron)", async () => {
    const { app } = makeContext();
    await request(app).get("/api/v1/jobs/reminders").set("Authorization", `Bearer ${JOB_TOKEN}`).expect(200);
    await request(app).get("/api/v1/jobs/reminders").set("Authorization", "Bearer wrong-token").expect(401);
    await request(app).get("/api/v1/jobs/reminders").expect(401);
  });
});
