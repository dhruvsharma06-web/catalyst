import request from "supertest";
import { describe, expect, it } from "vitest";
import { createLocalAiClient } from "../src/adapters/ai/local.js";
import { AiUnavailableError, type AiClient, type CareFacts } from "../src/adapters/ai/types.js";
import { elderClient, makeContext, metformin, newCircle, signedUpClient } from "./helpers.js";

const PNG = { imageBase64: "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk", mimeType: "image/png" };

/** Base64 text that decodes to exactly `bytes` bytes (bytes must be a multiple of 3). */
const base64Of = (bytes: number) => "A".repeat((bytes / 3) * 4);

const unavailableAi = (): AiClient => ({
  ...createLocalAiClient(),
  modelVersion: "fake-model",
  scanPrescription: async () => {
    throw new AiUnavailableError();
  },
  summarizeCare: async () => {
    throw new AiUnavailableError();
  },
});

describe("POST /ai/prescription-scan", () => {
  it("returns the contract shape from the default local client", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(200);
    expect(res.body).toEqual({
      medications: [
        expect.objectContaining({
          name: expect.any(String),
          dosage: expect.any(String),
          instructions: expect.any(String),
          times: expect.any(Array),
          daysOfWeek: expect.any(Array),
        }),
        expect.any(Object),
      ],
      confidence: expect.any(Number),
      notes: expect.any(String),
      model_version: "mock",
    });
  });

  it("never saves scanned medicines automatically", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", PNG).expect(200);
    expect((await elder.get("/medications").expect(200)).body.medications).toEqual([]);
  });

  it("normalises times and defaults to every day when the label gives none", async () => {
    const ai: AiClient = {
      ...createLocalAiClient(),
      modelVersion: "fake-model",
      scanPrescription: async () => ({
        medications: [
          { name: "A", dosage: "1", instructions: "", times: ["20:00", "08:00", "20:00"], daysOfWeek: [] },
          { name: "B", dosage: "1", instructions: "", times: [], daysOfWeek: [3, 1, 3] },
        ],
        confidence: 0.9,
        notes: "",
      }),
    };
    const { app } = makeContext({ ai });
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(200);
    expect(res.body.model_version).toBe("fake-model");
    expect(res.body.medications[0]).toMatchObject({ times: ["08:00", "20:00"], daysOfWeek: [0, 1, 2, 3, 4, 5, 6] });
    expect(res.body.medications[1]).toMatchObject({ times: [], daysOfWeek: [1, 3] });
  });

  it("passes an empty result through when the image is not a prescription", async () => {
    const ai: AiClient = {
      ...createLocalAiClient(),
      scanPrescription: async () => ({ medications: [], confidence: 0.1, notes: "This does not look like a prescription." }),
    };
    const { app } = makeContext({ ai });
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(200);
    expect(res.body).toMatchObject({ medications: [], notes: "This does not look like a prescription." });
  });

  it.each(["image/gif", "application/pdf", "text/html", ""])("rejects mime type %j", async (mimeType) => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", { ...PNG, mimeType }).expect(400);
    expect(res.body.error.code).toBe("INVALID_INPUT");
    expect(res.body.error.details[0].field).toBe("mimeType");
  });

  it.each(["image/jpeg", "image/png", "image/webp"])("accepts mime type %s", async (mimeType) => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", { ...PNG, mimeType }).expect(200);
  });

  it("rejects a missing or too-short image and unknown fields", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", { mimeType: "image/png" }).expect(400);
    await elder.post("/ai/prescription-scan", { ...PNG, imageBase64: "abc" }).expect(400);
    await elder.post("/ai/prescription-scan", { ...PNG, extra: 1 }).expect(400);
  });

  it("accepts an image of exactly 5 MB", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", { ...PNG, imageBase64: base64Of(5 * 1024 * 1024 - 2) }).expect(200);
  });

  it("rejects an image over 5 MB decoded with 413 PAYLOAD_TOO_LARGE", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", { ...PNG, imageBase64: base64Of(5 * 1024 * 1024 + 30) }).expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("rejects a request body beyond the 7 MB transport limit with 413", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", { ...PNG, imageBase64: "A".repeat(7_500_000) }).expect(413);
    expect(res.body.error.code).toBe("PAYLOAD_TOO_LARGE");
  });

  it("requires a session and the CSRF header", async () => {
    const { app } = makeContext();
    await request(app).post("/api/v1/ai/prescription-scan").set("X-Requested-With", "hearth").send(PNG).expect(401);
    const { elder } = await elderClient(app);
    expect(elder).toBeDefined();
    await request(app).post("/api/v1/ai/prescription-scan").send(PNG).expect(403);
  });

  it("answers 503 UPSTREAM_UNAVAILABLE when the AI provider is unavailable", async () => {
    const { app } = makeContext({ ai: unavailableAi() });
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(503);
    expect(res.body.error.code).toBe("UPSTREAM_UNAVAILABLE");
    expect(res.body.error.message).toMatch(/by hand/i);
  });

  it("answers 500 INTERNAL, without details, for unexpected AI failures", async () => {
    const ai: AiClient = {
      ...createLocalAiClient(),
      scanPrescription: async () => {
        throw new TypeError("boom: provider returned junk");
      },
    };
    const { app } = makeContext({ ai });
    const { elder } = await elderClient(app);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(500);
    expect(res.body.error.code).toBe("INTERNAL");
    expect(JSON.stringify(res.body)).not.toContain("junk");
  });
});

describe("GET /ai/care-summary", () => {
  it("returns the contract shape from the default local client", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body).toEqual({
      summary: expect.any(String),
      highlights: expect.any(Array),
      attention: expect.any(Array),
      model_version: "mock",
      generatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T.*Z$/),
    });
  });

  it("says nothing has been recorded when there are no settled doses", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body.summary).toMatch(/No medicine doses have been recorded/);
    expect(res.body.attention).toEqual([]);
  });

  it("flags missed doses, low stock and upcoming visits under attention", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    await elder.post("/medications", { ...metformin, stock: 3, refillAt: 5 }).expect(201);
    await elder
      .post("/appointments", {
        doctorName: "Dr. Rao",
        specialty: "Cardiology",
        location: "",
        startsAt: "2026-11-20T04:30:00.000Z",
        durationMinutes: 30,
        notes: "",
        reminderMinutesBefore: 60,
      })
      .expect(201);

    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body.attention).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^Metformin was missed \d+ times/),
        "Metformin is running low (3 left) — plan a refill.",
        expect.stringContaining("Visit with Dr. Rao (Cardiology)"),
      ]),
    );
    expect(res.body.summary).toMatch(/Kamala took 0% of medicines.*missed dose/);
    expect(res.body.summary).toMatch(/1 upcoming appointment/);
  });

  it("highlights perfect adherence", async () => {
    const { app } = makeContext();
    const { elder } = await elderClient(app);
    const med = (await elder.post("/medications", { ...metformin, startDate: "2026-11-15", times: ["08:00"] }).expect(201)).body;
    await elder.post(`/doses/${med.id}_2026-11-15_0800/log`, { status: "taken" }).expect(200);
    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body.highlights).toEqual(expect.arrayContaining(["Kamala took 100% of scheduled medicines over the last 7 days.", "Metformin: never missed."]));
    expect(res.body.summary).toContain("missed none");
  });

  it("only gives the model the elder's first name and aggregate data", async () => {
    let seen: CareFacts | undefined;
    const ai: AiClient = {
      ...createLocalAiClient(),
      summarizeCare: async (facts) => {
        seen = facts;
        return { summary: "ok", highlights: [], attention: [] };
      },
    };
    const { app } = makeContext({ ai });
    const { elder } = await elderClient(app);
    await elder.post("/medications", metformin).expect(201);
    await elder.get("/ai/care-summary").expect(200);
    expect(seen?.elderFirstName).toBe("Kamala");
    expect(seen?.periodDays).toBe(7);
    expect(seen?.lowStock).toEqual([]);
    expect(JSON.stringify(seen)).not.toMatch(/Iyer|kamala@example\.com/);
  });

  it("uses the model output and its version when the model works", async () => {
    const ai: AiClient = {
      ...createLocalAiClient(),
      modelVersion: "gemini-test",
      summarizeCare: async () => ({ summary: "A calm week.", highlights: ["Good"], attention: [] }),
    };
    const { app } = makeContext({ ai });
    const { elder } = await elderClient(app);
    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body).toMatchObject({ summary: "A calm week.", highlights: ["Good"], model_version: "gemini-test" });
  });

  it("falls back to deterministic rules, labelled as such, when the AI is unavailable", async () => {
    const { app } = makeContext({ ai: unavailableAi() });
    const { elder } = await elderClient(app);
    await elder.post("/medications", { ...metformin, stock: 2, refillAt: 5 }).expect(201);
    const res = await elder.get("/ai/care-summary").expect(200);
    expect(res.body.model_version).toBe("rules-fallback");
    expect(res.body.attention).toEqual(expect.arrayContaining([expect.stringContaining("Metformin is running low (2 left)")]));
    expect(res.body.generatedAt).toEqual(expect.any(String));
  });

  it("requires a session", async () => {
    const { app } = makeContext();
    await request(app).get("/api/v1/ai/care-summary").expect(401);
  });
});

describe("AI quota", () => {
  const limited = (ai?: AiClient) => makeContext({ env: { AI_HOURLY_LIMIT: "2" }, ...(ai && { ai }) });

  it("returns 429 RATE_LIMITED once the hourly limit is used", async () => {
    const { app } = limited();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", PNG).expect(200);
    await elder.get("/ai/care-summary").expect(200);
    const res = await elder.post("/ai/prescription-scan", PNG).expect(429);
    expect(res.body.error.code).toBe("RATE_LIMITED");
    await elder.get("/ai/care-summary").expect(429);
  });

  it("shares one allowance between scans and summaries", async () => {
    const { app } = limited();
    const { elder } = await elderClient(app);
    await elder.get("/ai/care-summary").expect(200);
    await elder.get("/ai/care-summary").expect(200);
    await elder.post("/ai/prescription-scan", PNG).expect(429);
  });

  it("counts each circle separately", async () => {
    const { app } = limited();
    const { elder } = await elderClient(app);
    await elder.get("/ai/care-summary").expect(200);
    await elder.get("/ai/care-summary").expect(200);
    await elder.get("/ai/care-summary").expect(429);

    const other = await signedUpClient(app, "Other");
    await other.post("/circles", newCircle).expect(201);
    await other.get("/ai/care-summary").expect(200);
  });

  it("resets in the next hour", async () => {
    const ctx = limited();
    const { elder } = await elderClient(ctx.app);
    await elder.get("/ai/care-summary").expect(200);
    await elder.get("/ai/care-summary").expect(200);
    await elder.get("/ai/care-summary").expect(429);

    ctx.clock.now = new Date("2026-11-15T07:05:00Z");
    await elder.get("/ai/care-summary").expect(200);
  });

  it("still counts calls when the provider is unavailable", async () => {
    const { app } = limited(unavailableAi());
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", PNG).expect(503);
    await elder.post("/ai/prescription-scan", PNG).expect(503);
    await elder.post("/ai/prescription-scan", PNG).expect(429);
  });

  it("does not spend quota on oversized or invalid images", async () => {
    const { app } = limited();
    const { elder } = await elderClient(app);
    await elder.post("/ai/prescription-scan", { ...PNG, imageBase64: base64Of(5 * 1024 * 1024 + 30) }).expect(413);
    await elder.post("/ai/prescription-scan", { ...PNG, mimeType: "image/gif" }).expect(400);
    await elder.post("/ai/prescription-scan", PNG).expect(200);
    await elder.post("/ai/prescription-scan", PNG).expect(200);
  });
});
