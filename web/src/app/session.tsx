import { createContext, useContext } from "react";
import type { Me, Member, User } from "../api/types";

export interface SessionValue {
  user: User;
  /** The active circle and the signed-in person's membership of it. */
  me: Me;
  /** Replaces the signed-in member after a profile change. */
  setMember: (member: Member) => void;
  /** Leaves the active circle view and returns to the list of circles. */
  switchCircle: () => void;
  signOut: () => Promise<void>;
}

export const SessionContext = createContext<SessionValue | null>(null);

export function useSession(): SessionValue {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error("useSession must be used inside the signed-in app");
  return ctx;
}
