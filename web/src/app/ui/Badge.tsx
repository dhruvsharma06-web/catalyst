import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

export type BadgeTone = "neutral" | "success" | "warning" | "danger" | "info" | "accent";

/** Status chip: always carries text (and usually an icon), never colour alone. */
export function Badge({ tone = "neutral", icon, children }: { tone?: BadgeTone; icon?: IconName; children: ReactNode }) {
  return (
    <span className={`hx-badge hx-badge--${tone}`}>
      {icon && <Icon name={icon} size={14} />}
      {children}
    </span>
  );
}
