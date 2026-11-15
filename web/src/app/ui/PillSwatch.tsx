import type { PillColor, PillShape } from "../../api/types";

export const PILL_COLORS: readonly PillColor[] = ["white", "blue", "pink", "yellow", "green", "orange"];
export const PILL_SHAPES: readonly PillShape[] = ["round", "oval", "capsule"];

/** Glazed enamel pill. Decorative: colour and shape are also stated in text where it matters. */
export function PillSwatch({ color, shape, size = "md" }: { color: PillColor; shape: PillShape; size?: "sm" | "md" | "lg" }) {
  return <span className={`hx-pill hx-pill--${color} hx-pill--${shape} hx-pill--${size}`} aria-hidden="true" />;
}

export const describePill = (color: PillColor, shape: PillShape): string => `${color} ${shape} pill`;
