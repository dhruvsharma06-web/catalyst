import { pino, type Logger } from "pino";

/** Structured JSON logger. Cloud Logging picks up `severity` automatically. */
export function createLogger(level: string): Logger {
  return pino({
    level,
    messageKey: "message",
    formatters: { level: (label) => ({ severity: label.toUpperCase() }) },
    redact: {
      paths: ["req.headers.cookie", "req.headers.authorization", 'req.headers["x-job-token"]', "res.headers[\"set-cookie\"]"],
      censor: "[redacted]",
    },
  });
}
