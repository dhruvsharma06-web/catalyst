import { pino } from "pino";
import request from "supertest";
import { vi } from "vitest";
import type { Express } from "express";
import { createLocalAiClient } from "../src/adapters/ai/local.js";
import type { AiClient } from "../src/adapters/ai/types.js";
import type { Email, Mailer } from "../src/adapters/mailer.js";
import { createApp } from "../src/app.js";
import { createSessionSigner } from "../src/auth/session.js";
import { loadConfig } from "../src/config.js";
import { createMemoryStore } from "../src/repo/memory.js";
import type { Deps } from "../src/services/deps.js";

// Every account and circle costs a scrypt hash; keep slow CI machines from tripping the default 5 s limit.
vi.setConfig({ testTimeout: 30_000 });

export const JOB_TOKEN = "test-job-token-0123456789abcdef";
export const PASSCODE = "sunrise-42";

export interface TestContext {
  app: Express;
  deps: Deps;
  outbox: Email[];
  clock: { now: Date };
}

/** Builds an isolated app with an in-memory store, a controllable clock and a capturing mailer. */
export function makeContext(
  overrides: { ai?: AiClient; now?: string; env?: Record<string, string>; mailer?: Mailer } = {},
): TestContext {
  const clock = { now: new Date(overrides.now ?? "2026-11-15T06:30:00Z") }; // 12:00 in Asia/Kolkata
  const outbox: Email[] = [];
  const mailer: Mailer = overrides.mailer ?? { transport: "log", send: async (e) => void outbox.push(e) };
  const config = loadConfig({ NODE_ENV: "test", JOB_TOKEN, SESSION_SECRET: "s".repeat(40), USE_MOCK_AI: "true", ...overrides.env });
  const deps: Deps = {
    config,
    logger: pino({ level: "silent" }),
    store: createMemoryStore(),
    ai: overrides.ai ?? createLocalAiClient(),
    mailer,
    signer: createSessionSigner(config.SESSION_SECRET),
    // Advances 1 ms per read so event ordering is deterministic, like a real clock.
    now: () => {
      clock.now = new Date(clock.now.getTime() + 1);
      return clock.now;
    },
  };
  return { app: createApp(deps), deps, outbox, clock };
}

/** A supertest agent that keeps cookies and sends the CSRF header. */
export function client(app: Express) {
  const agent = request.agent(app);
  const withHeader = <T extends { set: (k: string, v: string) => T }>(r: T) => r.set("X-Requested-With", "hearth");
  return {
    get: (url: string) => withHeader(agent.get(`/api/v1${url}`)),
    post: (url: string, body?: object) => withHeader(agent.post(`/api/v1${url}`)).send(body),
    patch: (url: string, body: object) => withHeader(agent.patch(`/api/v1${url}`)).send(body),
    delete: (url: string) => withHeader(agent.delete(`/api/v1${url}`)),
  };
}

export type Client = ReturnType<typeof client>;

export const PASSWORD = "correct-horse-battery";

/** Body for POST /circles (the creator's name and email come from their account). */
export const newCircle = {
  elderName: "Kamala Iyer",
  timezone: "Asia/Kolkata",
  passcode: PASSCODE,
  role: "elder",
};

export const metformin = {
  name: "Metformin",
  dosage: "500 mg",
  instructions: "Take with food",
  times: ["20:00", "08:00"],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate: "2026-11-01",
  endDate: null,
  stock: 6,
  refillAt: 5,
  color: "white",
  shape: "oval",
};

/** Creates an account and signs in; the returned client carries the session cookie. */
export async function signedUpClient(app: Express, name: string, email: string = `${name.toLowerCase()}@example.com`): Promise<Client> {
  const c = client(app);
  await c.post("/auth/signup", { name, email, password: PASSWORD }).expect(201);
  return c;
}

/** Signs up "Kamala", creates her circle as the elder and returns the client plus the circle code. */
export async function elderClient(app: Express): Promise<{ elder: Client; code: string }> {
  const elder = await signedUpClient(app, "Kamala");
  const res = await elder.post("/circles", newCircle).expect(201);
  return { elder, code: res.body.circle.code as string };
}

/** Signs up a new person and joins them to an existing circle. */
export async function joinClient(
  app: Express,
  code: string,
  name: string,
  role: "caretaker" | "family" | "elder",
  email: string | null = null,
  passcode: string = PASSCODE,
): Promise<Client> {
  const c = await signedUpClient(app, name, email ?? undefined);
  await c.post("/circles/join", { code, passcode, role }).expect(200);
  return c;
}
