import { decoyHash, hashPasscode as hashSecret, verifyPasscode as verifySecret } from "../auth/passcode.js";
import { newId } from "../domain/ids.js";
import type { Circle, Role, User, UserRecord } from "../domain/types.js";
import { AppError } from "../http/errors.js";
import { publicCircle, type Me } from "./circle.js";
import type { Deps } from "./deps.js";

export interface Account {
  user: User;
  circles: Array<{ circle: Circle; role: Role }>;
  active: Me | null;
}

/** Failed sign-ins allowed per account per clock hour, across all IP addresses. */
export const MAX_FAILED_LOGINS_PER_HOUR = 10;
const INVALID_LOGIN = "That email and password don't match. Please try again.";

export function publicUser(u: UserRecord): User {
  return { id: u.id, name: u.name, email: u.email, createdAt: u.createdAt };
}

export async function signup(deps: Deps, input: { name: string; email: string; password: string }): Promise<UserRecord> {
  const user: UserRecord = {
    id: newId("usr"),
    name: input.name,
    email: input.email,
    createdAt: deps.now().toISOString(),
    passwordHash: await hashSecret(input.password),
    sessionVersion: 1,
  };
  if (!(await deps.store.users.create(user))) {
    throw new AppError("CONFLICT", "An account with this email already exists. Try signing in instead.", [
      { field: "email", reason: "Already registered" },
    ]);
  }
  return user;
}

export async function login(deps: Deps, input: { email: string; password: string }): Promise<UserRecord> {
  const user = await deps.store.users.findByEmail(input.email);
  const failKey = `login-fail:${deps.now().toISOString().slice(0, 13)}`;
  if (user && (await deps.store.peek(user.id, failKey)) >= MAX_FAILED_LOGINS_PER_HOUR) {
    throw new AppError("RATE_LIMITED", "Too many attempts for this account. Please try again in an hour.");
  }
  // Always verify once, so response time does not reveal whether the email is registered.
  const ok = await verifySecret(input.password, user?.passwordHash ?? (await decoyHash()));
  if (user && !ok) await deps.store.increment(user.id, failKey);
  if (!user || !ok) throw new AppError("UNAUTHORIZED", INVALID_LOGIN);
  return user;
}

/** The signed-in person's view: their profile, every circle they belong to, and the active one. */
export async function buildAccount(deps: Deps, user: UserRecord, active: Me | null): Promise<Account> {
  const links = await deps.store.users.memberships.list(user.id);
  const circles = (
    await Promise.all(
      links.map(async (link) => {
        const record = await deps.store.circles.get(link.id);
        return record ? { circle: publicCircle(record), role: link.role } : null;
      }),
    )
  ).filter((c): c is { circle: Circle; role: Role } => c !== null);
  circles.sort((a, b) => a.circle.elderName.localeCompare(b.circle.elderName));
  return { user: publicUser(user), circles, active };
}

export async function issueToken(deps: Deps, user: UserRecord, circleId: string | null): Promise<string> {
  return deps.signer.sign({ userId: user.id, circleId, version: user.sessionVersion });
}
