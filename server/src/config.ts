import { randomBytes } from "node:crypto";
import { z } from "zod";

const bool = z
  .enum(["true", "false", "1", "0"])
  .optional()
  .transform((v) => v === "true" || v === "1");

const EnvSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  APP_URL: z.url().default("http://localhost:5173"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),

  SESSION_SECRET: z.string().trim().min(32).optional(),
  JOB_TOKEN: z.string().trim().min(24).optional(),

  STORE: z.enum(["memory", "firestore"]).default("memory"),
  GOOGLE_CLOUD_PROJECT: z.string().optional(),
  FIRESTORE_DATABASE_ID: z.string().default("(default)"),
  /** Service-account key JSON, only needed when running outside Google Cloud. */
  GOOGLE_CREDENTIALS_JSON: z.string().optional(),

  USE_MOCK_AI: bool,
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default("gemini-3-flash-preview"),
  GOOGLE_GENAI_USE_VERTEXAI: bool,
  GOOGLE_CLOUD_LOCATION: z.string().default("global"),
  AI_HOURLY_LIMIT: z.coerce.number().int().min(1).default(20),

  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().default(465),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  MAIL_FROM: z.string().default("Hearth Reminders <reminders@hearth.local>"),

  WEB_DIST: z.string().optional(),
});

export type Config = Omit<z.infer<typeof EnvSchema>, "SESSION_SECRET"> & {
  SESSION_SECRET: string;
  /** True when the AI adapter should return deterministic local output instead of calling Gemini. */
  aiMocked: boolean;
};

/**
 * Parses and validates process environment once at start-up.
 * In production a missing secret is a fatal misconfiguration, never silently defaulted.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ");
    throw new Error(`Invalid environment configuration: ${issues}`);
  }
  const cfg = parsed.data;
  if (cfg.NODE_ENV === "production") {
    if (!cfg.SESSION_SECRET) throw new Error("SESSION_SECRET is required in production");
    if (!cfg.JOB_TOKEN) throw new Error("JOB_TOKEN is required in production");
  }
  const hasGemini = Boolean(cfg.GEMINI_API_KEY) || cfg.GOOGLE_GENAI_USE_VERTEXAI;
  return {
    ...cfg,
    SESSION_SECRET: cfg.SESSION_SECRET ?? randomBytes(32).toString("hex"),
    aiMocked: cfg.USE_MOCK_AI || !hasGemini,
  };
}
