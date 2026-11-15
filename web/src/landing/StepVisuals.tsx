import { motion, useTransform } from "motion/react";
import type { MotionValue, Variants } from "motion/react";
import { SPRING } from "./ui";

interface StateProps {
  /** True while this step is the current one (or always, in the stacked layout). */
  active: boolean;
  /** Skip entrance animation and render the finished state. */
  settled: boolean;
}

const CODE = "MAPLE-4821".split("");

const charVariants: Variants = {
  off: { opacity: 0, y: 18, filter: "blur(8px)" },
  on: (i: number) => ({ opacity: 1, y: 0, filter: "blur(0px)", transition: { ...SPRING, delay: 0.08 + i * 0.05 } }),
};
const dotVariants: Variants = {
  off: { opacity: 0.25, scale: 0.4 },
  on: (i: number) => ({ opacity: 1, scale: 1, transition: { type: "spring", stiffness: 380, damping: 16, delay: 0.75 + i * 0.09 } }),
};
const liftVariants: Variants = {
  off: { opacity: 0, y: 16 },
  on: (delay: number) => ({ opacity: 1, y: 0, transition: { ...SPRING, delay } }),
};

/** Step 1: the circle code arrives character by character, then the passcode dots fill. */
export function CircleVisual({ active, settled }: StateProps) {
  return (
    <motion.div className="ld-vis" initial={settled ? false : "off"} animate={active ? "on" : "off"}>
      <p className="ld-vis__label">Circle code</p>
      <p className="ld-code" aria-hidden="true">
        {CODE.map((c, i) => (
          <motion.span key={i} custom={i} variants={charVariants}>
            {c}
          </motion.span>
        ))}
      </p>
      <p className="ld-vis__label">Passcode</p>
      <div className="ld-dots">
        {Array.from({ length: 6 }, (_, i) => (
          <motion.span key={i} custom={i} variants={dotVariants} />
        ))}
      </div>
      <motion.p className="ld-vis__hint" custom={1.4} variants={liftVariants}>
        Share both with family. Only people holding the code and passcode can join.
      </motion.p>
    </motion.div>
  );
}

const SCAN_LINES = ["METFORMIN HCL 500MG TAB", "1 TAB TWICE DAILY WITH FOOD", "QTY 60  REFILL 2"] as const;
const PARSED = [
  { k: "Name", v: "Metformin" },
  { k: "Dose", v: "500 mg" },
  { k: "Times", v: "8:00 and 20:00" },
] as const;

function ParsedChip({ lp, i, label, value }: { lp: MotionValue<number>; i: number; label: string; value: string }) {
  const start = 0.42 + i * 0.1;
  const opacity = useTransform(lp, [start, start + 0.16], [0, 1]);
  const y = useTransform(lp, [start, start + 0.16], [16, 0]);
  const blur = useTransform(lp, [start, start + 0.16], [8, 0], { clamp: true });
  const filter = useTransform(blur, (b) => `blur(${b}px)`);
  return (
    <motion.li className="ld-parsed__chip" style={{ opacity, y, filter }}>
      <span>{label}</span>
      <strong>{value}</strong>
    </motion.li>
  );
}

/** Step 2: a light beam sweeps a prescription label; its raw text dissolves into structured chips. */
export function ScanVisual({ lp }: { lp: MotionValue<number> }) {
  const beamY = useTransform(lp, [0.04, 0.5], ["-100%", "0%"]);
  const beamO = useTransform(lp, [0, 0.06, 0.5, 0.58], [0, 1, 1, 0]);
  const rawO = useTransform(lp, [0.3, 0.7], [1, 0.4]);
  const rawBlur = useTransform(lp, [0.3, 0.7], [0, 1.5]);
  const rawFilter = useTransform(rawBlur, (b) => `blur(${b}px)`);
  return (
    <div className="ld-vis">
      <div className="ld-label">
        <p className="ld-label__head">Pharmacy label</p>
        <motion.div className="ld-label__raw" style={{ opacity: rawO, filter: rawFilter }}>
          {SCAN_LINES.map((l) => (
            <p key={l}>{l}</p>
          ))}
        </motion.div>
        <motion.span className="ld-beam" style={{ y: beamY, opacity: beamO }} />
      </div>
      <ul className="ld-parsed">
        {PARSED.map((p, i) => (
          <ParsedChip key={p.k} lp={lp} i={i} label={p.k} value={p.v} />
        ))}
      </ul>
      <p className="ld-vis__hint">A draft for you to review. Nothing is saved until you confirm it.</p>
    </div>
  );
}

const pressVariants: Variants = {
  off: { scale: 1 },
  on: { scale: [1, 0.9, 1], transition: { delay: 0.45, duration: 0.35, times: [0, 0.4, 1] } },
};
const swapOut: Variants = { off: { opacity: 1 }, on: { opacity: 0, transition: { delay: 0.7, duration: 0.18 } } };
const swapIn: Variants = {
  off: { opacity: 0, scale: 0.4 },
  on: { opacity: 1, scale: 1, transition: { type: "spring", stiffness: 420, damping: 14, delay: 0.72 } },
};
const mailVariants: Variants = {
  off: { opacity: 0, x: 90, y: -70, rotate: 9, scale: 0.8 },
  on: { opacity: 1, x: 0, y: 0, rotate: -1.5, scale: 1, transition: { type: "spring", stiffness: 70, damping: 15, delay: 1.1 } },
};

/** Step 3: Taken is pressed, then a glass envelope flies in with the family email. */
export function NotifyVisual({ active, settled }: StateProps) {
  return (
    <motion.div className="ld-vis" initial={settled ? false : "off"} animate={active ? "on" : "off"}>
      <div className="ld-takenrow">
        <span className="ld-takenrow__pill" />
        <span className="ld-takenrow__text">
          <strong>Amlodipine</strong>
          <span>5 mg &middot; 9:00</span>
        </span>
        <motion.span className="ld-takenrow__btn" variants={pressVariants}>
          <motion.span variants={swapOut}>Taken</motion.span>
          <motion.svg className="ld-takenrow__tick" variants={swapIn} viewBox="0 0 16 16" focusable="false">
            <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </motion.svg>
        </motion.span>
      </div>
      <motion.div className="ld-mail" variants={mailVariants}>
        <svg className="ld-mail__flap" viewBox="0 0 100 24" preserveAspectRatio="none" focusable="false">
          <path d="M0 0 L50 22 L100 0" fill="none" stroke="currentColor" strokeWidth="1.2" />
        </svg>
        <p className="ld-mail__from">Hearth &middot; to the care circle</p>
        <p className="ld-mail__subject">Evening dose missed</p>
        <p className="ld-mail__body">Atorvastatin 10 mg was due at 21:00 and has not been marked taken.</p>
      </motion.div>
    </motion.div>
  );
}
