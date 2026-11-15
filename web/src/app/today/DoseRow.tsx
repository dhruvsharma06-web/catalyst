import { motion, useReducedMotion, type Variants } from "motion/react";
import { Badge, Button, PillSwatch, describePill, type BadgeTone, type IconName } from "../ui";
import type { Dose, DoseLogStatus } from "../../api/types";
import { formatClock } from "../util/format";

const STATUS: Record<Dose["status"], { label: string; tone: BadgeTone; icon: IconName }> = {
  taken: { label: "Taken", tone: "success", icon: "check" },
  skipped: { label: "Skipped", tone: "neutral", icon: "skip" },
  missed: { label: "Missed", tone: "danger", icon: "warning" },
  due: { label: "Due now", tone: "warning", icon: "clock" },
  upcoming: { label: "Later", tone: "info", icon: "clock" },
};

/** Staggered entrance, driven by the list that wraps the rows. */
export const DOSE_LIST: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } } };
const DOSE_ITEM: Variants = {
  hidden: { opacity: 0, y: 10 },
  show: { opacity: 1, y: 0, transition: { type: "spring", duration: 0.4, bounce: 0.12 } },
};

interface Props {
  dose: Dose;
  busy: boolean;
  onLog: (dose: Dose, status: DoseLogStatus) => void;
}

/** One compartment of the pill organizer. */
export function DoseRow({ dose, busy, onLog }: Props) {
  const reduce = useReducedMotion();
  const s = STATUS[dose.status];
  const settled = dose.status === "taken" || dose.status === "skipped";
  return (
    <motion.li
      id={`dose-${dose.id}`}
      tabIndex={-1}
      className={`hx-dose hx-dose--${dose.status}`}
      variants={reduce ? undefined : DOSE_ITEM}
      layout={reduce ? false : "position"}
    >
      <span className="hx-dose__pill">
        <PillSwatch color={dose.color} shape={dose.shape} size="lg" />
        {dose.status === "taken" && (
          <motion.span
            className="hx-dose__check"
            aria-hidden="true"
            initial={reduce ? false : { scale: 0.3, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={reduce ? { duration: 0 } : { type: "spring", stiffness: 520, damping: 18 }}
          >
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
              <motion.path
                d="M5 12.5l4.5 4.5L19 7.5"
                initial={reduce ? false : { pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={reduce ? { duration: 0 } : { duration: 0.28, delay: 0.08, ease: [0.23, 1, 0.32, 1] }}
              />
            </svg>
          </motion.span>
        )}
      </span>
      <div className="hx-dose__info">
        <p className="hx-dose__name">
          {dose.name} <span className="hx-dose__dosage">{dose.dosage}</span>
        </p>
        <p className="hx-dose__meta">
          <span>{formatClock(dose.time)}</span>
          <Badge tone={s.tone} icon={s.icon}>
            {s.label}
          </Badge>
          <span className="visually-hidden">{describePill(dose.color, dose.shape)}</span>
        </p>
      </div>
      <div className="hx-dose__actions">
        {settled ? (
          <Button
            variant="ghost"
            disabled={busy}
            aria-label={`Change ${dose.name} to ${dose.status === "taken" ? "skipped" : "taken"}`}
            onClick={() => onLog(dose, dose.status === "taken" ? "skipped" : "taken")}
          >
            Change
          </Button>
        ) : (
          <>
            <Button variant="primary" size="lg" icon="check" aria-disabled={busy} aria-label={`Mark ${dose.name} as taken`} onClick={() => onLog(dose, "taken")}>
              Taken
            </Button>
            <Button aria-disabled={busy} aria-label={`Skip ${dose.name}`} onClick={() => onLog(dose, "skipped")}>
              Skip
            </Button>
          </>
        )}
      </div>
    </motion.li>
  );
}
