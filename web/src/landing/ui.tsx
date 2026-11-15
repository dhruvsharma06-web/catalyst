import { useRef } from "react";
import type { ElementType, ReactNode } from "react";
import { Link } from "react-router";
import { motion, useReducedMotion, useSpring } from "motion/react";
import { useSheen } from "./hooks";

export const SPRING = { type: "spring", stiffness: 140, damping: 22, mass: 0.9 } as const;

interface GlassProps {
  as?: ElementType;
  className?: string;
  children?: ReactNode;
  /** Lift on hover (bento tiles, cards). */
  lift?: boolean;
  id?: string;
  "aria-labelledby"?: string;
  "aria-label"?: string;
  role?: string;
}

/** Frosted material: blur + saturate, gradient edge, top highlight, grain and a pointer-following sheen. */
export function Glass({ as: Tag = "div", className = "", lift = false, children, ...rest }: GlassProps) {
  const onPointerMove = useSheen();
  return (
    <Tag className={`ld-glass ${lift ? "ld-glass--lift" : ""} ${className}`} onPointerMove={onPointerMove} {...rest}>
      {children}
    </Tag>
  );
}

interface RevealProps {
  children: ReactNode;
  delay?: number;
  className?: string;
  /** "text" blurs into focus; "panel" skips filter so child backdrop blur keeps working. */
  kind?: "text" | "panel";
}

/** Blur-to-sharp rise, once, on a spring. Final state is rendered immediately under reduced motion. */
export function Reveal({ children, delay = 0, className, kind = "text" }: RevealProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;
  const hidden = kind === "text" ? { opacity: 0, y: 28, filter: "blur(10px)" } : { opacity: 0, y: 36, scale: 0.97 };
  const shown = kind === "text" ? { opacity: 1, y: 0, filter: "blur(0px)" } : { opacity: 1, y: 0, scale: 1 };
  return (
    <motion.div
      className={className}
      initial={hidden}
      whileInView={shown}
      viewport={{ once: true, margin: "0px 0px -12% 0px" }}
      transition={{ ...SPRING, delay }}
    >
      {children}
    </motion.div>
  );
}

interface CtaProps {
  to: string;
  variant: "primary" | "glass";
  children: ReactNode;
  magnetic?: boolean;
}

/** Call-to-action link. Primary uses the accent fill; glass is a frosted secondary. Magnetic on fine pointers. */
export function Cta({ to, variant, children, magnetic = false }: CtaProps) {
  const reduced = useReducedMotion();
  const box = useRef<DOMRect | null>(null);
  const x = useSpring(0, { stiffness: 220, damping: 16, mass: 0.5 });
  const y = useSpring(0, { stiffness: 220, damping: 16, mass: 0.5 });
  const sheen = useSheen();
  const link = (
    <Link to={to} className={`ld-btn ld-btn--${variant}`} onPointerMove={variant === "glass" ? sheen : undefined}>
      {children}
    </Link>
  );
  if (!magnetic || reduced) return link;
  return (
    <motion.span
      className="ld-mag"
      style={{ x, y }}
      onPointerEnter={(e) => {
        box.current = e.currentTarget.getBoundingClientRect();
      }}
      onPointerMove={(e) => {
        const r = box.current;
        if (!r || e.pointerType !== "mouse") return;
        x.set((e.clientX - (r.left + r.width / 2)) * 0.28);
        y.set((e.clientY - (r.top + r.height / 2)) * 0.34);
      }}
      onPointerLeave={() => {
        x.set(0);
        y.set(0);
      }}
    >
      {link}
    </motion.span>
  );
}
