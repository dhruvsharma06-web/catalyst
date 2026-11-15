import { decoyHash, hashPasscode, verifyPasscode } from "../auth/passcode.js";
import type { SessionClaims } from "../auth/session.js";
import { newCircleCode, newId } from "../domain/ids.js";
import type { Actor, Circle, CircleRecord, Member, NotifyPrefs, Role, UserRecord } from "../domain/types.js";
import { AppError, forbidden, notFound } from "../http/errors.js";
import { recordActivity } from "./activity.js";
import type { Deps } from "./deps.js";

/** The active-circle context for a signed-in member. */
export interface Me {
  member: Member;
  circle: Circle;
}

export interface ResolvedSession {
  user: UserRecord;
  /** Null when the user has no active circle, or is no longer a member of it. */
  me: Me | null;
}

const DEFAULT_NOTIFY: NotifyPrefs = { doses: true, missed: true, appointments: true };
/** Wrong circle passcodes allowed per circle per clock hour, across all IP addresses. */
export const MAX_FAILED_JOINS_PER_HOUR = 20;
const INVALID_JOIN = "That circle code and passcode don't match. Please check both and try again.";

export function publicCircle(c: CircleRecord): Circle {
  return { id: c.id, code: c.code, elderName: c.elderName, timezone: c.timezone, createdAt: c.createdAt };
}

export function toActor(circleId: string, m: Member): Actor {
  return { memberId: m.id, name: m.name, role: m.role, circleId };
}

async function uniqueCode(deps: Deps): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = newCircleCode();
    if (!(await deps.store.circles.findByCode(code))) return code;
  }
  throw new AppError("INTERNAL", "Could not allocate a circle code. Please try again.");
}

/** Adds the user to the circle and keeps the account's membership index in step. */
async function addMember(deps: Deps, circleId: string, user: UserRecord, role: Role): Promise<Member> {
  const member: Member = {
    id: user.id,
    name: user.name,
    role,
    email: user.email,
    notify: { ...DEFAULT_NOTIFY },
    joinedAt: deps.now().toISOString(),
  };
  await deps.store.members.put(circleId, member);
  await deps.store.users.memberships.put(user.id, { id: circleId, role, joinedAt: member.joinedAt });
  return member;
}

export async function createCircle(
  deps: Deps,
  user: UserRecord,
  input: { elderName: string; timezone: string; passcode: string; role: Role },
): Promise<Me> {
  const circle: CircleRecord = {
    id: newId("cir"),
    code: await uniqueCode(deps),
    elderName: input.elderName,
    timezone: input.timezone,
    createdAt: deps.now().toISOString(),
    passcodeHash: await hashPasscode(input.passcode),
  };
  await deps.store.circles.create(circle);
  const member = await addMember(deps, circle.id, user, input.role);
  await recordActivity(deps, toActor(circle.id, member), "circle.created", `${member.name} created the care circle for ${circle.elderName}`);
  return { circle: publicCircle(circle), member };
}

export async function joinCircle(
  deps: Deps,
  user: UserRecord,
  input: { code: string; passcode: string; role: Role },
): Promise<Me> {
  const circle = await deps.store.circles.findByCode(input.code);
  // Per-circle lockout complements the per-IP limiter: it stops guessing spread across many addresses.
  const failKey = `join-fail:${deps.now().toISOString().slice(0, 13)}`;
  if (circle && (await deps.store.peek(circle.id, failKey)) >= MAX_FAILED_JOINS_PER_HOUR) {
    throw new AppError("RATE_LIMITED", "Too many wrong attempts for this circle. Please try again in an hour.");
  }
  // Always run one scrypt verification so response time does not reveal whether a code exists.
  const ok = await verifyPasscode(input.passcode, circle?.passcodeHash ?? (await decoyHash()));
  if (circle && !ok) await deps.store.increment(circle.id, failKey);
  if (!circle || !ok) throw new AppError("UNAUTHORIZED", INVALID_JOIN);

  const existing = await deps.store.members.get(circle.id, user.id);
  if (existing) return { circle: publicCircle(circle), member: existing };

  if (input.role === "elder") {
    const members = await deps.store.members.list(circle.id);
    if (members.some((m) => m.role === "elder")) {
      throw forbidden("This circle already has an elder. Please join as family or caretaker.");
    }
  }
  const member = await addMember(deps, circle.id, user, input.role);
  await recordActivity(deps, toActor(circle.id, member), "member.joined", `${member.name} joined as ${member.role}`);
  return { circle: publicCircle(circle), member };
}

/** Looks up the user's membership of a circle; null when they are not a member. */
export async function membershipOf(deps: Deps, userId: string, circleId: string): Promise<Me | null> {
  const [circle, member] = await Promise.all([deps.store.circles.get(circleId), deps.store.members.get(circleId, userId)]);
  return circle && member ? { circle: publicCircle(circle), member } : null;
}

/**
 * Resolves verified token claims into a live user and, if set, their active circle.
 * Returns null when the account no longer exists or the password changed since sign-in.
 */
export async function resolveSession(deps: Deps, claims: SessionClaims): Promise<ResolvedSession | null> {
  const user = await deps.store.users.get(claims.userId);
  if (!user || user.sessionVersion !== claims.version) return null;
  const me = claims.circleId ? await membershipOf(deps, user.id, claims.circleId) : null;
  return { user, me };
}

export async function listMembers(deps: Deps, circleId: string): Promise<Member[]> {
  const members = await deps.store.members.list(circleId);
  const order: Record<Role, number> = { elder: 0, caretaker: 1, family: 2 };
  return members.sort((a, b) => order[a.role] - order[b.role] || a.name.localeCompare(b.name));
}

export async function updateMe(deps: Deps, actor: Actor, patch: { email?: string | null; notify?: NotifyPrefs }): Promise<Member> {
  const current = await deps.store.members.get(actor.circleId, actor.memberId);
  if (!current) throw notFound("Member");
  const next: Member = {
    ...current,
    ...(patch.email !== undefined && { email: patch.email }),
    ...(patch.notify !== undefined && { notify: patch.notify }),
  };
  await deps.store.members.put(actor.circleId, next);
  return next;
}

/**
 * Who may manage the circle: the elder. If no elder has joined yet, caretakers act on their behalf
 * so a circle set up by a helper is never left unmanageable.
 */
async function assertCanManage(deps: Deps, actor: Actor): Promise<Member[]> {
  const members = await deps.store.members.list(actor.circleId);
  const hasElder = members.some((m) => m.role === "elder");
  const allowed = actor.role === "elder" || (!hasElder && actor.role === "caretaker");
  if (!allowed) throw forbidden(hasElder ? "Only the elder can do this." : "Only the elder or a caretaker can do this.");
  return members;
}

export async function removeMember(deps: Deps, actor: Actor, memberId: string): Promise<void> {
  const members = await assertCanManage(deps, actor);
  const target = members.find((m) => m.id === memberId);
  if (!target) throw notFound("Member");
  if (target.id === actor.memberId) throw new AppError("CONFLICT", "You can't remove yourself from the circle.");
  await deps.store.members.delete(actor.circleId, memberId);
  await deps.store.users.memberships.delete(memberId, actor.circleId);
  await recordActivity(deps, actor, "member.removed", `${actor.name} removed ${target.name} from the circle`);
}

/** Rotates the join passcode. Existing members keep access; only new joins need the new passcode. */
export async function changePasscode(deps: Deps, actor: Actor, input: { currentPasscode: string; newPasscode: string }): Promise<void> {
  await assertCanManage(deps, actor);
  const circle = await deps.store.circles.get(actor.circleId);
  if (!circle) throw notFound("Circle");
  if (!(await verifyPasscode(input.currentPasscode, circle.passcodeHash))) {
    throw new AppError("INVALID_INPUT", "The current passcode is not correct.", [{ field: "currentPasscode", reason: "Incorrect" }]);
  }
  await deps.store.circles.update(circle.id, { passcodeHash: await hashPasscode(input.newPasscode) });
  await recordActivity(deps, actor, "circle.passcode_changed", `${actor.name} changed the circle passcode`);
}
