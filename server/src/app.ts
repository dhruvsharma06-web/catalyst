import { existsSync } from "node:fs";
import path from "node:path";
import cookieParser from "cookie-parser";
import express, { type ErrorRequestHandler, type Express } from "express";
import { rateLimit } from "express-rate-limit";
import helmet from "helmet";
import { pinoHttp } from "pino-http";
import { randomUUID } from "node:crypto";
import { AppError } from "./http/errors.js";
import { requireCsrfHeader } from "./http/middleware.js";
import { aiRoutes } from "./http/routes/ai.js";
import { careRoutes } from "./http/routes/care.js";
import { jobRoutes } from "./http/routes/jobs.js";
import { authRoutes, circleRoutes } from "./http/routes/session.js";
import type { Deps } from "./services/deps.js";

export const VERSION = process.env.npm_package_version ?? "1.0.0";

/** Builds the Express application. Pure wiring: every dependency is injected. */
export function createApp(deps: Deps, options: { webDist?: string } = {}): Express {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Cloud Run terminates TLS at one Google front-end proxy.

  app.use(
    pinoHttp({
      logger: deps.logger,
      genReqId: (req) => (req.headers["x-cloud-trace-context"] as string | undefined)?.split("/")[0] ?? randomUUID(),
      autoLogging: { ignore: (req) => req.url === "/health" },
      serializers: { req: (req: { id: string; method: string; url: string }) => ({ id: req.id, method: req.method, url: req.url }) },
    }),
  );

  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: true,
        directives: {
          "default-src": ["'self'"],
          "script-src": ["'self'"],
          "style-src": ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
          "font-src": ["'self'", "https://fonts.gstatic.com"],
          "img-src": ["'self'", "data:", "blob:"],
          "connect-src": ["'self'"],
          "frame-ancestors": ["'none'"],
          "form-action": ["'self'"],
          "base-uri": ["'self'"],
          "object-src": ["'none'"],
        },
      },
      strictTransportSecurity: deps.config.NODE_ENV === "production" ? { maxAge: 63072000, includeSubDomains: true } : false,
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      crossOriginEmbedderPolicy: false,
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(), payment=()");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", version: VERSION });
  });
  app.get("/ready", async (_req, res) => {
    const ok = await deps.store.ping();
    res.status(ok ? 200 : 503).json({ status: ok ? "ready" : "unavailable" });
  });

  const api = express.Router();
  api.use((_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  // Coarse per-IP ceiling for the whole API; sensitive routes add tighter limits of their own.
  api.use(
    rateLimit({
      windowMs: 60_000,
      limit: deps.config.NODE_ENV === "test" ? 10_000 : 300,
      standardHeaders: "draft-8",
      legacyHeaders: false,
      handler: (_req, _res, next) => next(new AppError("RATE_LIMITED", "Too many requests. Please slow down and try again.")),
    }),
  );
  api.use(cookieParser());
  api.use("/ai", express.json({ limit: "7mb" }));
  api.use(express.json({ limit: "100kb" }));
  api.use("/jobs", jobRoutes(deps));
  api.use(requireCsrfHeader);
  api.use("/auth", authRoutes(deps));
  api.use(circleRoutes(deps));
  api.use("/ai", aiRoutes(deps));
  api.use(careRoutes(deps));
  api.use((_req, _res, next) => next(new AppError("NOT_FOUND", "That API endpoint does not exist.")));
  app.use("/api/v1", api);

  const webDist = options.webDist;
  if (webDist && existsSync(path.join(webDist, "index.html"))) {
    app.use(
      "/assets",
      express.static(path.join(webDist, "assets"), { immutable: true, maxAge: "1y", index: false, fallthrough: false }),
    );
    app.use(express.static(webDist, { index: false, maxAge: "1h" }));
    // Client-side routes: always serve the app shell, never cached so deploys take effect immediately.
    app.get(/^\/(?!api\/).*/, (_req, res) => {
      res.setHeader("Cache-Control", "no-cache");
      res.sendFile(path.join(webDist, "index.html"));
    });
  }

  app.use(errorHandler(deps));
  return app;
}

function errorHandler(deps: Deps): ErrorRequestHandler {
  return (err, req, res, _next) => {
    let appErr: AppError;
    if (err instanceof AppError) {
      appErr = err;
    } else if (err?.type === "entity.too.large") {
      appErr = new AppError("PAYLOAD_TOO_LARGE", "That upload is too large.");
    } else if (err?.type === "entity.parse.failed") {
      appErr = new AppError("INVALID_INPUT", "The request body is not valid JSON.");
    } else if (err?.status === 404 || err?.statusCode === 404) {
      appErr = new AppError("NOT_FOUND", "Not found.");
    } else {
      // Unknown failures: full detail to logs, a generic message to the client.
      (req.log ?? deps.logger).error({ err }, "unhandled error");
      appErr = new AppError("INTERNAL", "Something went wrong on our side. Please try again.");
    }
    if (appErr.status >= 500 && err instanceof AppError) (req.log ?? deps.logger).warn({ code: appErr.code }, appErr.message);
    res.status(appErr.status).json(appErr.toBody());
  };
}
