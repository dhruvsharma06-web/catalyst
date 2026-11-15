import type { ElementType, HTMLAttributes, ReactNode } from "react";
import { sheenRef } from "./useSheen";

interface Props extends HTMLAttributes<HTMLElement> {
  as?: ElementType;
  tone?: "glass" | "accent";
  /** Adds the pointer-follow sheen for cards that behave like controls. */
  interactive?: boolean;
  children: ReactNode;
}

/** Frosted glass surface with a gradient edge. */
export function Card({ as: Tag = "section", tone = "glass", interactive = false, className = "", children, ...rest }: Props) {
  const classes = ["hx-card", tone === "accent" ? "hx-card--accent" : "", interactive ? "hx-sheen" : "", className].filter(Boolean).join(" ");
  return (
    <Tag {...rest} ref={interactive ? sheenRef : undefined} className={classes}>
      {children}
    </Tag>
  );
}
