import { useRef, useState } from "react";
import type { ReactNode } from "react";
import { motion, useMotionValue, useMotionValueEvent, useReducedMotion, useScroll, useTransform } from "motion/react";
import type { MotionValue } from "motion/react";
import { Glass, Reveal } from "./ui";
import { useMatchMedia } from "./hooks";
import { CircleVisual, NotifyVisual, ScanVisual } from "./StepVisuals";

const STEPS = [
  { title: "Create the circle", body: "Sign in, name the circle and set a passcode. Share the code with the people who help." },
  { title: "Snap a prescription", body: "Photograph the label. Hearth drafts the schedule, and the elder confirms before anything is saved." },
  { title: "Tap Taken", body: "The circle sees it at once. If a dose is missed, the family gets an email." },
] as const;

const COUNT = STEPS.length;
const FADE = 0.05;

function Intro() {
  return (
    <div className="ld-story__intro">
      <h2 id="ld-how-title" className="ld-h2">
        Three taps from a paper label to a calmer morning.
      </h2>
    </div>
  );
}

/** One panel of the pinned stage; crossfades with its neighbours as scroll progress passes it. */
function StepPanel({ p, i, children }: { p: MotionValue<number>; i: number; children: ReactNode }) {
  const a = i / COUNT;
  const b = (i + 1) / COUNT;
  const first = i === 0;
  const last = i === COUNT - 1;
  const input = first ? [b - FADE, b] : last ? [a - FADE, a] : [a - FADE, a, b - FADE, b];
  const pick = (hidden: number, shown: number, gone: number) =>
    first ? [shown, gone] : last ? [hidden, shown] : [hidden, shown, shown, gone];
  const opacity = useTransform(p, input, pick(0, 1, 0));
  const y = useTransform(p, input, pick(28, 0, -28));
  const blur = useTransform(p, input, pick(8, 0, 8));
  const filter = useTransform(blur, (v) => `blur(${v}px)`);
  return (
    <motion.div className="ld-panel" style={{ opacity, y, filter }}>
      {children}
    </motion.div>
  );
}

function Segment({ p, i }: { p: MotionValue<number>; i: number }) {
  const scaleX = useTransform(p, [i / COUNT, (i + 1) / COUNT], [0, 1]);
  return (
    <span className="ld-seg" aria-hidden="true">
      <motion.span style={{ scaleX }} />
    </span>
  );
}

/** Scroll-pinned story: a sticky glass stage whose content morphs through three steps. */
function Pinned() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress: p } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const [step, setStep] = useState(0);
  useMotionValueEvent(p, "change", (v) => setStep(Math.min(COUNT - 1, Math.floor(v * COUNT))));
  const scanProgress = useTransform(p, [0.355, 0.63], [0, 1]);

  return (
    <section id="how" className="ld-story ld-story--pinned" ref={ref} aria-labelledby="ld-how-title">
      <div className="ld-story__sticky">
        <div className="ld-story__text">
          <Intro />
          <ol className="ld-steps">
            {STEPS.map((s, i) => (
              <li key={s.title} className={`ld-step ${i === step ? "is-active" : ""}`}>
                <Segment p={p} i={i} />
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </li>
            ))}
          </ol>
        </div>
        <Glass className="ld-story__stage">
          <div className="ld-panels" aria-hidden="true">
            <StepPanel p={p} i={0}>
              <CircleVisual active={step === 0} settled={false} />
            </StepPanel>
            <StepPanel p={p} i={1}>
              <ScanVisual lp={scanProgress} />
            </StepPanel>
            <StepPanel p={p} i={2}>
              <NotifyVisual active={step === 2} settled={false} />
            </StepPanel>
          </div>
        </Glass>
      </div>
    </section>
  );
}

/** Small screens and reduced motion: a plain vertical sequence, no pinning, finished states. */
function Stacked() {
  const done = useMotionValue(1);
  const visuals = [
    <CircleVisual key="c" active settled />,
    <ScanVisual key="s" lp={done} />,
    <NotifyVisual key="n" active settled />,
  ];
  return (
    <section id="how" className="ld-section ld-story" aria-labelledby="ld-how-title">
      <Reveal>
        <Intro />
      </Reveal>
      <ol className="ld-stack">
        {STEPS.map((s, i) => (
          <li key={s.title} className="ld-stack__item">
            <Reveal kind="panel">
              <Glass className="ld-stack__card">
                <div aria-hidden="true">{visuals[i]}</div>
                <h3>{s.title}</h3>
                <p>{s.body}</p>
              </Glass>
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  );
}

export function Story() {
  const reduced = useReducedMotion();
  const wide = useMatchMedia("(min-width: 900px) and (min-height: 620px)");
  return wide && !reduced ? <Pinned /> : <Stacked />;
}
