import { useId, useState } from "react";
import type { CSSProperties } from "react";
import { CircleOrbit } from "./CircleOrbit";
import { Glass, Reveal } from "./ui";

const PRINCIPLES = [
  {
    title: "Large text, read aloud",
    body: "Elder mode raises type size and contrast, and reads the day out loud with the browser's own voice.",
  },
  {
    title: "Access is theirs to revoke",
    body: "The elder can remove any member and change the passcode at any time. Family cannot.",
  },
  {
    title: "Every change has a name",
    body: "Each edit lands in the activity log with who made it, so nothing happens quietly.",
  },
] as const;

/** A live control: drag the slider and a sample dose card rescales, the way Elder mode does. */
function SizeDemo() {
  const id = useId();
  const [pct, setPct] = useState(125);
  return (
    <Glass className="ld-size" lift>
      <div className="ld-size__card" style={{ "--ld-scale": pct / 100 } as CSSProperties}>
        <p className="ld-size__time">Morning, 8:00</p>
        <p className="ld-size__name">Metformin</p>
        <p className="ld-size__dose">500 mg, one tablet with food</p>
        <span className="ld-size__btn">Taken</span>
      </div>
      <div className="ld-size__control">
        <label htmlFor={id}>
          Text size <output htmlFor={id}>{pct}%</output>
        </label>
        <input
          id={id}
          type="range"
          min={100}
          max={175}
          step={5}
          value={pct}
          onChange={(e) => setPct(Number(e.target.value))}
          style={{ "--fill": `${((pct - 100) / 75) * 100}%` } as CSSProperties}
        />
      </div>
    </Glass>
  );
}

export function Elder() {
  return (
    <section id="elder" className="ld-section ld-elder" aria-labelledby="ld-elder-title">
      <div className="ld-elder__lead">
        <CircleOrbit />
        <Reveal>
          <h2 id="ld-elder-title" className="ld-display ld-display--xl">
            The elder stays in charge.
          </h2>
        </Reveal>
        <Reveal delay={0.08}>
          <p className="ld-lede">
            Hearth is not a monitoring tool pointed at someone. It is their routine, kept in one place, shared with the
            people they choose.
          </p>
        </Reveal>
      </div>
      <ul className="ld-principles">
        {PRINCIPLES.map((p, i) => (
          <li key={p.title}>
            <Reveal delay={i * 0.08}>
              <h3>{p.title}</h3>
              <p>{p.body}</p>
            </Reveal>
          </li>
        ))}
      </ul>
      <Reveal kind="panel" className="ld-elder__demo">
        <SizeDemo />
      </Reveal>
    </section>
  );
}
