import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "hearth_session";
export const SESSION_TTL_SECONDS = 12 * 60 * 60;

export interface SessionClaims {
  userId: string;
  /** The circle the user is currently working in, if any. Membership is re-checked on every request. */
  circleId: string | null;
  /** Must equal the user's current sessionVersion; bumped when the password changes. */
  version: number;
}

export interface SessionSigner {
  sign(claims: SessionClaims): Promise<string>;
  verify(token: string): Promise<SessionClaims | null>;
}

/** HS256-signed session tokens, carried only in an httpOnly cookie. */
export function createSessionSigner(secret: string): SessionSigner {
  const key = new TextEncoder().encode(secret);
  return {
    async sign({ userId, circleId, version }) {
      return new SignJWT({ cid: circleId, v: version })
        .setProtectedHeader({ alg: "HS256" })
        .setSubject(userId)
        .setIssuedAt()
        .setIssuer("hearth")
        .setExpirationTime(`${SESSION_TTL_SECONDS}s`)
        .sign(key);
    },
    async verify(token) {
      try {
        const { payload } = await jwtVerify(token, key, { issuer: "hearth", algorithms: ["HS256"] });
        const cid = payload.cid;
        if (typeof payload.sub !== "string" || typeof payload.v !== "number") return null;
        if (cid !== null && typeof cid !== "string") return null;
        return { userId: payload.sub, circleId: cid ?? null, version: payload.v };
      } catch {
        return null;
      }
    },
  };
}
