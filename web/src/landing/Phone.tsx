import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { AnimatePresence, motion, useMotionValue, useReducedMotion, useSpring, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { Glass } from "./ui";
import { useActive } from "./hooks";

interface Dose {
  id: string;
  name: string;
  dose: string;
  time: string;
  pill: string;
}

const DOSES: readonly Dose[] = [
  { id: "met", name: "Metformin", dose: "500 mg", time: "8:00", pill: "var(--pill-blue)" },
  { id: "amlo", name: "Amlodipine", dose: "5 mg", time: "9:00", pill: "var(--pill-pink)" },
  { id: "ator", name: "Atorvastatin", dose: "10 mg", time: "21:00", pill: "var(--pill-yellow)" },
];

/** Demo timeline in ms: rest, press, checked, toast on screen, toast leaving. */
const STEP_MS = [1700, 420, 600, 2900, 700] as const;
const FINAL_STEP = 3;

/** Loops the micro-demo only while the phone is on screen and the tab is visible. */
function useDemoStep(active: boolean, reduced: boolean): number {
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (!active || reduced) return;
    const id = window.setTimeout(() => setStep((s) => (s + 1) % STEP_MS.length), STEP_MS[step] ?? 1000);
    return () => window.clearTimeout(id);
  }, [active, reduced, step]);
  return reduced ? FINAL_STEP : step;
}

const PRESS = { type: "spring", stiffness: 520, damping: 22 } as const;

function DoseRow({ dose, taken, pressing }: { dose: Dose; taken: boolean; pressing: boolean }) {
  return (
    <li className={`ld-dose ${taken ? "is-taken" : ""}`}>
      <span className="ld-dose__pill" style={{ background: dose.pill }} />
      <span className="ld-dose__text">
        <span className="ld-dose__name">{dose.name}</span>
        <span className="ld-dose__meta">
          {dose.dose} &middot; {dose.time}
        </span>
      </span>
      <span className="ld-dose__action">
        <AnimatePresence mode="popLayout" initial={false}>
          {taken ? (
            <motion.span
              key="done"
              className="ld-dose__check"
              initial={{ scale: 0.4, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.6, opacity: 0 }}
              transition={{ type: "spring", stiffness: 420, damping: 15 }}
            >
              <svg viewBox="0 0 16 16" width="1em" height="1em" focusable="false">
                <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </motion.span>
          ) : (
            <motion.span
              key="btn"
              className="ld-dose__btn"
              animate={{ scale: pressing ? 0.9 : 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              transition={PRESS}
            >
              Taken
            </motion.span>
          )}
        </AnimatePresence>
      </span>
    </li>
  );
}

function ProgressRing({ done }: { done: number }) {
  return (
    <div className="ld-ring">
      <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
        <circle cx="50" cy="50" r="42" className="ld-ring__track" />
        <motion.circle
          cx="50"
          cy="50"
          r="42"
          className="ld-ring__value"
          initial={false}
          animate={{ pathLength: done / DOSES.length }}
          transition={{ type: "spring", stiffness: 70, damping: 16 }}
        />
      </svg>
      <div className="ld-ring__label">
        <AnimatePresence mode="popLayout" initial={false}>
          <motion.span
            key={done}
            className="ld-ring__num"
            initial={{ y: 12, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: -12, opacity: 0 }}
            transition={{ type: "spring", stiffness: 300, damping: 24 }}
          >
            {done}/{DOSES.length}
          </motion.span>
        </AnimatePresence>
        <span className="ld-ring__cap">taken</span>
      </div>
    </div>
  );
}

function Screen({ step }: { step: number }) {
  const taken = step >= 2;
  const pressing = step === 1;
  const done = taken ? 2 : 1;
  return (
    <div className="ld-screen" aria-hidden="true">
      <div className="ld-screen__bar">
        <span>9:02</span>
        <span className="ld-screen__island" />
        <span className="ld-screen__signal" />
      </div>
      <p className="ld-screen__day">Thursday</p>
      <p className="ld-screen__hello">Good morning</p>
      <div className="ld-screen__card">
        <ProgressRing done={done} />
        <div className="ld-screen__next">
          <span className="ld-screen__kicker">Up next</span>
          <span className="ld-screen__big">{taken ? "Atorvastatin" : "Amlodipine"}</span>
          <span className="ld-screen__small">{taken ? "21:00" : "9:00"}</span>
        </div>
      </div>
      <ul className="ld-doses">
        {DOSES.map((d) => (
          <DoseRow key={d.id} dose={d} taken={d.id === "met" || (d.id === "amlo" && taken)} pressing={d.id === "amlo" && pressing} />
        ))}
      </ul>
      <div className="ld-appt">
        <span className="ld-appt__dot" />
        <span>
          <strong>Dr. Rao</strong>
          <span>Thursday, 10:30</span>
        </span>
      </div>
      <span className="ld-screen__home" />
      <AnimatePresence>
        {step === 3 && (
          <motion.div
            className="ld-toast"
            initial={{ y: 36, opacity: 0, scale: 0.94 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 20, opacity: 0, scale: 0.97, transition: { duration: 0.22, ease: [0.16, 1, 0.3, 1] } }}
            transition={{ type: "spring", stiffness: 260, damping: 20 }}
          >
            <span className="ld-toast__dot" />
            <span className="ld-toast__text">
              <strong>Saved for the circle</strong>
              <span>Amlodipine 5 mg taken</span>
            </span>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ChipProps {
  px: MotionValue<number>;
  py: MotionValue<number>;
  depth: number;
  className: string;
  tone: string;
  children: ReactNode;
}

/** A glass chip floating at its own depth: pointer parallax on the shell, slow drift on the inner. */
function Chip({ px, py, depth, className, tone, children }: ChipProps) {
  const x = useSpring(useTransform(px, (v) => v * -22 * depth), { stiffness: 90, damping: 18 });
  const y = useSpring(useTransform(py, (v) => v * -18 * depth), { stiffness: 90, damping: 18 });
  return (
    <motion.div className={`ld-chip-shell ${className}`} style={{ x, y }} aria-hidden="true">
      <Glass className="ld-chip">
        <span className="ld-chip__dot" style={{ background: tone }} />
        {children}
      </Glass>
    </motion.div>
  );
}

/** The hero centrepiece: a glass phone running a looped Today-screen demo, tilting toward the pointer. */
export function Phone() {
  const reduced = useReducedMotion() ?? false;
  const stage = useRef<HTMLDivElement>(null);
  const active = useActive(stage);
  const step = useDemoStep(active, reduced);

  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const ry = useSpring(useTransform(px, (v) => -10 + v * 7), { stiffness: 110, damping: 16 });
  const rx = useSpring(useTransform(py, (v) => 4 - v * 7), { stiffness: 110, damping: 16 });

  useEffect(() => {
    if (reduced) return;
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      px.set((e.clientX / window.innerWidth) * 2 - 1);
      py.set((e.clientY / window.innerHeight) * 2 - 1);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => window.removeEventListener("pointermove", onMove);
  }, [reduced, px, py]);

  return (
    <div ref={stage} className="ld-stage" data-paused={!active}>
      <div className="ld-stage__glow" aria-hidden="true">
        <span className="ld-orb ld-orb--ember" />
        <span className="ld-orb ld-orb--rose" />
        <span className="ld-orb ld-orb--teal" />
      </div>
      <motion.div
        className="ld-tilt"
        style={reduced ? undefined : { rotateX: rx, rotateY: ry }}
        initial={reduced ? false : { opacity: 0, y: 60, scale: 0.94 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 70, damping: 18, delay: 0.35 }}
      >
        <div className="ld-float">
          <Glass
            className="ld-phone"
            role="img"
            aria-label="Hearth Today screen: a progress ring shows doses taken, with Metformin 500 mg at 8:00, Amlodipine 5 mg at 9:00 and Atorvastatin 10 mg at 21:00. Tapping Taken checks off a dose for everyone in the circle."
          >
            <Screen step={step} />
          </Glass>
        </div>
      </motion.div>
      <Chip px={px} py={py} depth={1.2} className="ld-chip-shell--a" tone="var(--info)">
        Dr. Rao &middot; Thu 10:30
      </Chip>
      <Chip px={px} py={py} depth={1.9} className="ld-chip-shell--b" tone="var(--warning)">
        12 tablets left
      </Chip>
      <Chip px={px} py={py} depth={0.8} className="ld-chip-shell--c" tone="var(--success)">
        3-day streak
      </Chip>
    </div>
  );
}
