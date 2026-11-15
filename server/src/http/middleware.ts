import { timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, RequestHandler, Response } from "express";
import type { z } from "zod";
import { SESSION_COOKIE, SESSION_TTL_SECONDS } from "../auth/session.js";
import type { Actor, Circle, Member, UserRecord } from "../domain/types.js";
import { resolveSession, toActor } from "../services/circle.js";
import type { Deps } from "../services/deps.js";
import { AppError, type ErrorDetail } from "./errors.js";

/** The signed-in account, attached by `requireUser`. */
export interface UserLocals {
  user: UserRecord;
  /** Active circle from the token, if the user is still a member of it. */
  activeCircleId: string | null;
}

/** Per-request circle context, attached by `requireMember`. */
export interface SessionLocals {
  user: UserRecord;
  actor: Actor;
  member: Member;
  circle: Circle;
}

export function currentUser(res: Response): UserLocals {
  const u = res.locals.user as UserLocals | undefined;
  if (!u) throw new AppError("UNAUTHORIZED", "Please sign in.");
  return u;
}

/** The active circle context if the signed-in user has one, otherwise null. */
export function activeCircle(res: Response): { member: Member; circle: Circle } | null {
  const s = res.locals.session as SessionLocals | undefined;
  return s ? { member: s.member, circle: s.circle } : null;
}

export function session(res: Response): SessionLocals {
  const s = res.locals.session as SessionLocals | undefined;
  if (!s) throw new AppError("UNAUTHORIZED", "Please sign in.");
  return s;
}

/** Wraps async handlers so rejected promises reach the error handler. */
export const handle =
  (fn: (req: Request, res: Response) => Promise<unknown>): RequestHandler =>
  (req, res, next) => {
    fn(req, res).catch(next);
  };

/** Validates input against a schema; failures become INVALID_INPUT with per-field details. */
export function parse<T>(schema: z.ZodType<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const details: ErrorDetail[] = result.error.issues.map((i) => ({
    field: i.path.join(".") || "body",
    reason: i.code === "unrecognized_keys" ? `Unknown field(s): ${i.keys.join(", ")}` : i.message,
  }));
  throw new AppError("INVALID_INPUT", "Some details need another look.", details);
}

/**
 * CSRF defence for cookie-authenticated writes: browsers cannot attach a custom header
 * cross-site without a CORS preflight, which this API never grants.
 */
export const requireCsrfHeader: RequestHandler = (req, _res, next) => {
  const safe = req.method === "GET" || req.method === "HEAD" || req.method === "OPTIONS";
  if (safe || req.get("x-requested-with") === "hearth") return next();
  next(new AppError("FORBIDDEN", "Request blocked. Please reload the page and try again."));
};

/**
 * Authentication: resolves the session cookie into a live account. Rejects with
 * UNAUTHORIZED when the token is missing, invalid, expired or from before a password change.
 */
export function requireUser(deps: Deps): RequestHandler {
  return (req, res, next) => {
    const authenticate = async () => {
      const token = (req.cookies as Record<string, string | undefined>)[SESSION_COOKIE];
      const claims = token ? await deps.signer.verify(token) : null;
      const resolved = claims ? await resolveSession(deps, claims) : null;
      if (!resolved) {
        if (token) clearSessionCookie(res, deps);
        throw new AppError("UNAUTHORIZED", "Please sign in.");
      }
      const locals: UserLocals = { user: resolved.user, activeCircleId: resolved.me?.circle.id ?? null };
      res.locals.user = locals;
      if (resolved.me) {
        const s: SessionLocals = {
          user: resolved.user,
          member: resolved.me.member,
          circle: resolved.me.circle,
          actor: toActor(resolved.me.circle.id, resolved.me.member),
        };
        res.locals.session = s;
      }
    };
    authenticate().then(() => next(), next);
  };
}

/**
 * Authorization: the signed-in user must be a current member of their active circle.
 * Membership is re-checked on every request, so removal takes effect immediately.
 */
export function requireMember(deps: Deps): RequestHandler {
  const authenticate = requireUser(deps);
  return (req, res, next) => {
    authenticate(req, res, (err?: unknown) => {
      if (err) return next(err);
      if (!res.locals.session) {
        return next(new AppError("CONFLICT", "Choose a care circle first."));
      }
      next();
    });
  };
}

export function setSessionCookie(res: Response, deps: Deps, token: string): void {
  res.cookie(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: deps.config.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_TTL_SECONDS * 1000,
  });
}

export function clearSessionCookie(res: Response, deps: Deps): void {
  res.clearCookie(SESSION_COOKIE, { httpOnly: true, secure: deps.config.NODE_ENV === "production", sameSite: "lax", path: "/" });
}

/**
 * Protects the scheduler endpoint with a shared secret compared in constant time.
 * Accepts `X-Job-Token` (Cloud Scheduler) or `Authorization: Bearer` (Vercel Cron).
 */
export function requireJobToken(deps: Deps): RequestHandler {
  return (req: Request, _res: Response, next: NextFunction) => {
    const expected = deps.config.JOB_TOKEN;
    const bearer = /^Bearer (.+)$/.exec(req.get("authorization") ?? "")?.[1];
    const given = req.get("x-job-token") ?? bearer ?? "";
    const a = Buffer.from(given);
    const b = Buffer.from(expected ?? "");
    if (!expected || a.length !== b.length || !timingSafeEqual(a, b)) {
      return next(new AppError("UNAUTHORIZED", "Invalid job token."));
    }
    next();
  };
}
