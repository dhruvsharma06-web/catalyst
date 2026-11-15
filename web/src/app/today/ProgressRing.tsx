import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";

/** Glowing arc showing how many of today's medicines are done; animates to its value. */
export function ProgressRing({ done, total }: { done: number; total: number }) {
  const reduce = useReducedMotion();
  const gradient = `hx-ring-${useId().replace(/:/g, "")}`;
  const r = 52;
  const c = 2 * Math.PI * r;
  const fraction = total === 0 ? 0 : Math.min(1, done / total);
  return (
    <figure className="hx-ring" role="img" aria-label={`${done} of ${total} medicines done today`}>
      <svg viewBox="0 0 120 120" width="132" height="132" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" style={{ stopColor: "var(--aurora-amber)" }} />
            <stop offset="0.55" style={{ stopColor: "var(--aurora-ember)" }} />
            <stop offset="1" style={{ stopColor: "var(--aurora-rose)" }} />
          </linearGradient>
        </defs>
        <circle className="hx-ring__track" cx="60" cy="60" r={r} fill="none" strokeWidth="12" />
        <motion.circle
          className="hx-ring__bar"
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="12"
          strokeLinecap="round"
          stroke={`url(#${gradient})`}
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - fraction), opacity: fraction > 0 ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.9, bounce: 0.1 }}
          transform="rotate(-90 60 60)"
        />
      </svg>
      <figcaption className="hx-ring__label" aria-hidden="true">
        <strong>{done}</strong>
        <span>of {total}</span>
      </figcaption>
    </figure>
  );
}
