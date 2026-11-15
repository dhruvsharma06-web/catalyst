import { Router, type RequestHandler } from "express";
import { rateLimit } from "express-rate-limit";
import * as accounts from "../../services/account.js";
import * as circles from "../../services/circle.js";
import type { Deps } from "../../services/deps.js";
import { AppError } from "../errors.js";
import {
  activeCircle,
  clearSessionCookie,
  currentUser,
  handle,
  parse,
  requireMember,
  requireUser,
  session,
  setSessionCookie,
} from "../middleware.js";
import {
  activeCircleSchema,
  changePasscodeSchema,
  createCircleSchema,
  joinSchema,
  loginSchema,
  signupSchema,
  updateMeSchema,
} from "../schemas.js";

function limiter(deps: Deps, limit: number, windowMs: number): RequestHandler {
  return rateLimit({
    limit: deps.config.NODE_ENV === "test" ? 10_000 : limit,
    windowMs,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new AppError("RATE_LIMITED", "Too many attempts. Please wait a few minutes and try again.")),
  });
}

/** Accounts: sign up, sign in, sign out and the signed-in person's overview. */
export function authRoutes(deps: Deps): Router {
  const r = Router();
  const user = requireUser(deps);
  const signInLimit = limiter(deps, 10, 15 * 60 * 1000);
  const signUpLimit = limiter(deps, 5, 60 * 60 * 1000);

  r.post("/signup", signUpLimit, handle(async (req, res) => {
    const created = await accounts.signup(deps, parse(signupSchema, req.body));
    setSessionCookie(res, deps, await accounts.issueToken(deps, created, null));
    res.status(201).json(await accounts.buildAccount(deps, created, null));
  }));

  r.post("/login", signInLimit, handle(async (req, res) => {
    const found = await accounts.login(deps, parse(loginSchema, req.body));
    setSessionCookie(res, deps, await accounts.issueToken(deps, found, null));
    res.json(await accounts.buildAccount(deps, found, null));
  }));

  r.get("/me", user, handle(async (_req, res) => {
    res.json(await accounts.buildAccount(deps, currentUser(res).user, activeCircle(res)));
  }));

  r.post("/logout", (_req, res) => {
    clearSessionCookie(res, deps);
    res.status(204).end();
  });

  return r;
}

/** Circles: create, join, switch, and manage membership. All require a signed-in account. */
export function circleRoutes(deps: Deps): Router {
  const r = Router();
  const user = requireUser(deps);
  const member = requireMember(deps);
  const joinLimit = limiter(deps, 10, 15 * 60 * 1000);
  const createLimit = limiter(deps, 5, 60 * 60 * 1000);

  /** Makes `circleId` the active circle in a freshly signed session cookie. */
  const activate = async (res: Parameters<RequestHandler>[1], circleId: string) => {
    setSessionCookie(res, deps, await accounts.issueToken(deps, currentUser(res).user, circleId));
  };

  r.post("/circles", user, createLimit, handle(async (req, res) => {
    const me = await circles.createCircle(deps, currentUser(res).user, parse(createCircleSchema, req.body));
    await activate(res, me.circle.id);
    res.status(201).json(me);
  }));

  r.post("/circles/join", user, joinLimit, handle(async (req, res) => {
    const me = await circles.joinCircle(deps, currentUser(res).user, parse(joinSchema, req.body));
    await activate(res, me.circle.id);
    res.json(me);
  }));

  r.post("/circles/active", user, handle(async (req, res) => {
    const { circleId } = parse(activeCircleSchema, req.body);
    const me = await circles.membershipOf(deps, currentUser(res).user.id, circleId);
    if (!me) throw new AppError("FORBIDDEN", "You are not a member of that circle.");
    await activate(res, circleId);
    res.json(me);
  }));

  r.post("/circles/passcode", member, joinLimit, handle(async (req, res) => {
    await circles.changePasscode(deps, session(res).actor, parse(changePasscodeSchema, req.body));
    res.status(204).end();
  }));

  r.get("/session", member, handle(async (_req, res) => {
    const s = session(res);
    res.json({ member: s.member, circle: s.circle });
  }));

  r.get("/members", member, handle(async (_req, res) => {
    res.json({ members: await circles.listMembers(deps, session(res).circle.id) });
  }));

  r.patch("/members/me", member, handle(async (req, res) => {
    res.json(await circles.updateMe(deps, session(res).actor, parse(updateMeSchema, req.body)));
  }));

  r.delete("/members/:id", member, handle(async (req, res) => {
    await circles.removeMember(deps, session(res).actor, String(req.params.id));
    res.status(204).end();
  }));

  return r;
}
