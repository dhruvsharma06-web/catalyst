import type { Dose } from "../../api/types";
import { formatClock } from "../util/format";

export const canSpeak = (): boolean =>
  typeof window !== "undefined" && "speechSynthesis" in window && typeof SpeechSynthesisUtterance !== "undefined";

/** Spoken summary of the doses still to do today. */
export function buildReadAloud(doses: Dose[]): string {
  const remaining = doses.filter((d) => d.status !== "taken" && d.status !== "skipped");
  if (remaining.length === 0) return "You have no medicines left to take today. Well done.";
  const lines = remaining.map((d) => `At ${formatClock(d.time)}, ${d.name}, ${d.dosage}.`);
  const count = remaining.length === 1 ? "1 medicine" : `${remaining.length} medicines`;
  return `You have ${count} left today. ${lines.join(" ")}`;
}
