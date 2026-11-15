import { createGeminiClient } from "./adapters/ai/gemini.js";
import { createLocalAiClient } from "./adapters/ai/local.js";
import { createLogMailer, createSmtpMailer } from "./adapters/mailer.js";
import { createSessionSigner } from "./auth/session.js";
import type { Config } from "./config.js";
import { createLogger } from "./logger.js";
import { createFirestoreStore, type FirestoreCredentials } from "./repo/firestore.js";
import { createMemoryStore } from "./repo/memory.js";
import type { Deps } from "./services/deps.js";

/** Parses a service-account key supplied as JSON in an environment variable (used outside Google Cloud). */
function parseCredentials(json: string | undefined): FirestoreCredentials | undefined {
  if (!json) return undefined;
  const parsed = JSON.parse(json) as { client_email?: unknown; private_key?: unknown };
  if (typeof parsed.client_email !== "string" || typeof parsed.private_key !== "string") {
    throw new Error("GOOGLE_CREDENTIALS_JSON must be a service-account key with client_email and private_key");
  }
  return { client_email: parsed.client_email, private_key: parsed.private_key };
}

/** Wires every adapter from configuration. Shared by the long-running server and the serverless entry. */
export function buildDeps(config: Config): Deps {
  const logger = createLogger(config.LOG_LEVEL);
  return {
    config,
    logger,
    store:
      config.STORE === "firestore"
        ? createFirestoreStore(config.GOOGLE_CLOUD_PROJECT, config.FIRESTORE_DATABASE_ID, parseCredentials(config.GOOGLE_CREDENTIALS_JSON))
        : createMemoryStore(),
    ai: config.aiMocked
      ? createLocalAiClient()
      : createGeminiClient({
          model: config.GEMINI_MODEL,
          apiKey: config.GEMINI_API_KEY,
          vertex: config.GOOGLE_GENAI_USE_VERTEXAI ? { project: config.GOOGLE_CLOUD_PROJECT, location: config.GOOGLE_CLOUD_LOCATION } : undefined,
        }),
    mailer: config.SMTP_HOST
      ? createSmtpMailer({ host: config.SMTP_HOST, port: config.SMTP_PORT, user: config.SMTP_USER, pass: config.SMTP_PASS, from: config.MAIL_FROM })
      : createLogMailer(logger),
    signer: createSessionSigner(config.SESSION_SECRET),
    now: () => new Date(),
  };
}
