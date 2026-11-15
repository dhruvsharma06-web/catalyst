import { randomBytes, randomInt } from "node:crypto";

/** URL-safe random id with a readable prefix, e.g. "med_k3x9…". Never contains "_" after the prefix. */
export function newId(prefix: string): string {
  return `${prefix}_${randomBytes(12).toString("base64url").replace(/[-_]/g, "x")}`;
}

const WORDS = [
  "MAPLE", "CEDAR", "RIVER", "LOTUS", "AMBER", "CORAL", "WILLOW", "SAFFRON", "JASMINE", "HARBOR",
  "MEADOW", "ORCHID", "SUMMIT", "BIRCH", "TULSI", "GARNET", "SPARROW", "LANTERN", "PEBBLE", "MANGO",
] as const;

/** Human-friendly circle code like "MAPLE-4821" — easy to read aloud over the phone. */
export function newCircleCode(): string {
  return `${WORDS[randomInt(WORDS.length)]}-${String(randomInt(10000)).padStart(4, "0")}`;
}
