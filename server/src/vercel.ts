import { createApp } from "./app.js";
import { buildDeps } from "./bootstrap.js";
import { loadConfig } from "./config.js";

/**
 * Serverless entry for Vercel. The platform serves the built web app as static files,
 * so this handler only answers /api/* and the health probes. Module scope is reused
 * across warm invocations, so dependencies are built once per instance.
 */
const config = loadConfig();
if (config.NODE_ENV === "production" && config.STORE !== "firestore") {
  throw new Error("Serverless deployments need STORE=firestore: in-memory data does not survive between requests.");
}

export default createApp(buildDeps(config));
