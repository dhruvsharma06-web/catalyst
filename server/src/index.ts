import path from "node:path";
import { fileURLToPath } from "node:url";
import { createApp } from "./app.js";
import { buildDeps } from "./bootstrap.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const deps = buildDeps(config);
const { logger } = deps;

const here = path.dirname(fileURLToPath(import.meta.url));
const webDist = config.WEB_DIST ?? path.resolve(here, "../../web/dist");
const app = createApp(deps, { webDist });

const server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, store: config.STORE, ai: deps.ai.modelVersion, mail: deps.mailer.transport },
    "Hearth server listening",
  );
  if (config.NODE_ENV !== "production" && !process.env.SESSION_SECRET) {
    logger.warn("SESSION_SECRET not set: using a random secret, sessions reset on restart");
  }
});

// Cloud Run sends SIGTERM before stopping an instance; finish in-flight requests first.
for (const signal of ["SIGTERM", "SIGINT"] as const) {
  process.on(signal, () => {
    logger.info({ signal }, "shutting down");
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10_000).unref();
  });
}
