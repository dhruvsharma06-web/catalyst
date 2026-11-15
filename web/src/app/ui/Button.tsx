import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

type Variant = "primary" | "secondary" | "ghost" | "danger";

interface Common {
  variant?: Variant;
  size?: "md" | "lg";
  icon?: IconName;
  block?: boolean;
  children: ReactNode;
}

const cls = (v: Variant, size: string, block?: boolean): string =>
  `hx-btn hx-btn--${v} hx-btn--${size}${block ? " hx-btn--block" : ""}`;

export function Button({
  variant = "secondary",
  size = "md",
  icon,
  block,
  loading,
  children,
  type = "button",
  disabled,
  ...rest
}: Common & { loading?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      {...rest}
      type={type}
      className={`${cls(variant, size, block)} ${rest.className ?? ""}`.trim()}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
    >
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </button>
  );
}

/** Anchor styled as a button (downloads, external links). */
export function ButtonLink({
  variant = "secondary",
  size = "md",
  icon,
  block,
  children,
  ...rest
}: Common & AnchorHTMLAttributes<HTMLAnchorElement>) {
  return (
    <a {...rest} className={`${cls(variant, size, block)} ${rest.className ?? ""}`.trim()}>
      {icon && <Icon name={icon} />}
      <span>{children}</span>
    </a>
  );
}

export function IconButton({
  label,
  icon,
  ...rest
}: { label: string; icon: IconName } & Omit<ButtonHTMLAttributes<HTMLButtonElement>, "aria-label">) {
  return (
    <button type="button" {...rest} className={`hx-iconbtn ${rest.className ?? ""}`.trim()} aria-label={label} title={label}>
      <Icon name={icon} />
    </button>
  );
}
