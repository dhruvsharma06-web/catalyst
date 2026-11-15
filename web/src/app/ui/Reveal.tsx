import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

/** List whose items stagger in and animate layout when added or removed. */
export function RevealList({ className = "hx-list", children }: { className?: string; children: ReactNode }) {
  return (
    <ul className={className}>
      <AnimatePresence initial>{children}</AnimatePresence>
    </ul>
  );
}

/** One item of a RevealList. `index` sets the stagger delay (capped so long lists never feel slow). */
export function RevealItem({ index, children }: { index: number; children: ReactNode }) {
  const reduce = useReducedMotion();
  if (reduce) return <li>{children}</li>;
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0, transition: { type: "spring", duration: 0.4, bounce: 0.12, delay: Math.min(index, 8) * 0.05 } }}
      exit={{ opacity: 0, transition: { duration: 0.14 } }}
    >
      {children}
    </motion.li>
  );
}
