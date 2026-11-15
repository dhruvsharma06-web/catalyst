import { describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";

const SECRET = "s".repeat(40);
const TOKEN = "t".repeat(32);

describe("loadConfig", () => {
  it("applies defaults in development", () => {
    const cfg = loadConfig({});
    expect(cfg).toMatchObject({ NODE_ENV: "development", PORT: 8080, STORE: "memory", AI_HOURLY_LIMIT: 20 });
  });

  it("generates an ephemeral session secret outside production", () => {
    const a = loadConfig({});
    const b = loadConfig({});
    expect(a.SESSION_SECRET).toHaveLength(64);
    expect(a.SESSION_SECRET).not.toBe(b.SESSION_SECRET);
  });

  it("keeps a configured session secret", () => {
    expect(loadConfig({ SESSION_SECRET: SECRET }).SESSION_SECRET).toBe(SECRET);
  });

  it("requires SESSION_SECRET in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", JOB_TOKEN: TOKEN })).toThrow(/SESSION_SECRET is required/);
  });

  it("requires JOB_TOKEN in production", () => {
    expect(() => loadConfig({ NODE_ENV: "production", SESSION_SECRET: SECRET })).toThrow(/JOB_TOKEN is required/);
  });

  it("accepts a complete production configuration", () => {
    const cfg = loadConfig({ NODE_ENV: "production", SESSION_SECRET: SECRET, JOB_TOKEN: TOKEN });
    expect(cfg.NODE_ENV).toBe("production");
    expect(cfg.JOB_TOKEN).toBe(TOKEN);
  });

  it("rejects a session secret that is too short", () => {
    expect(() => loadConfig({ SESSION_SECRET: "short" })).toThrow(/SESSION_SECRET/);
  });

  it("rejects a job token that is too short", () => {
    expect(() => loadConfig({ JOB_TOKEN: "short" })).toThrow(/JOB_TOKEN/);
  });

  it.each(["abc", "0", "70000", "80.5", "-1"])("rejects invalid PORT %j", (port) => {
    expect(() => loadConfig({ PORT: port })).toThrow(/Invalid environment configuration.*PORT/);
  });

  it("parses a valid PORT", () => {
    expect(loadConfig({ PORT: "3000" }).PORT).toBe(3000);
  });

  it("rejects an unknown NODE_ENV or STORE", () => {
    expect(() => loadConfig({ NODE_ENV: "staging" })).toThrow(/NODE_ENV/);
    expect(() => loadConfig({ STORE: "redis" })).toThrow(/STORE/);
  });

  it("mocks AI when no Gemini credentials exist", () => {
    expect(loadConfig({}).aiMocked).toBe(true);
  });

  it("uses Gemini when an API key is present", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key" }).aiMocked).toBe(false);
  });

  it("uses Gemini when Vertex AI is enabled", () => {
    expect(loadConfig({ GOOGLE_GENAI_USE_VERTEXAI: "true" }).aiMocked).toBe(false);
  });

  it("lets USE_MOCK_AI override available credentials", () => {
    expect(loadConfig({ GEMINI_API_KEY: "key", USE_MOCK_AI: "true" }).aiMocked).toBe(true);
    expect(loadConfig({ GEMINI_API_KEY: "key", USE_MOCK_AI: "1" }).aiMocked).toBe(true);
  });
});
