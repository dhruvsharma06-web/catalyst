import { Router } from "express";
import type { Deps } from "../../services/deps.js";
import { careSummary, scanPrescription } from "../../services/insight.js";
import { handle, parse, requireMember, session } from "../middleware.js";
import { scanSchema } from "../schemas.js";

/** Gemini-powered features. Results are drafts for people to confirm, never automatic actions. */
export function aiRoutes(deps: Deps): Router {
  const r = Router();
  r.use(requireMember(deps));

  r.post("/prescription-scan", handle(async (req, res) => {
    const { imageBase64, mimeType } = parse(scanSchema, req.body);
    res.json(await scanPrescription(deps, session(res).circle.id, imageBase64, mimeType));
  }));

  r.get("/care-summary", handle(async (_req, res) => {
    res.json(await careSummary(deps, session(res).circle));
  }));

  return r;
}
