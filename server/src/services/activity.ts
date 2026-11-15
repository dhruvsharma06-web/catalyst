import { newId } from "../domain/ids.js";
import type { Activity, Actor } from "../domain/types.js";
import type { Deps } from "./deps.js";

/** Appends an entry to the circle's activity log so the elder can always see who changed what. */
export async function recordActivity(deps: Deps, actor: Actor, kind: string, summary: string): Promise<void> {
  const entry: Activity = {
    id: newId("act"),
    at: deps.now().toISOString(),
    actorName: actor.name,
    actorRole: actor.role,
    kind,
    summary,
  };
  await deps.store.activity.put(actor.circleId, entry);
}

export function listActivity(deps: Deps, circleId: string, limit: number): Promise<Activity[]> {
  return deps.store.activity.list(circleId, { orderBy: { field: "at", direction: "desc" }, limit });
}
