import { Router } from "express";
import { runReminders } from "../../jobs/reminders.js";
import type { Deps } from "../../services/deps.js";
import { handle, requireJobToken } from "../middleware.js";

/** Endpoints invoked by Cloud Scheduler, authenticated with a shared job token. */
export function jobRoutes(deps: Deps): Router {
  const r = Router();
  const sweep = handle(async (_req, res) => {
    const result = await runReminders(deps);
    deps.logger.info(result, "reminder sweep complete");
    res.json(result);
  });
  r.post("/reminders", requireJobToken(deps), sweep);
  // Vercel Cron issues GET requests; the sweep is idempotent, so GET is safe here.
  r.get("/reminders", requireJobToken(deps), sweep);
  return r;
}
