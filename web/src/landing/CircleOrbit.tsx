import type { CSSProperties } from "react";
import { Mark } from "../shared/Mark";

const MEMBERS = [
  { label: "Caretaker", initial: "M", angle: -30, delay: 0 },
  { label: "Family", initial: "A", angle: 90, delay: 1.6 },
  { label: "Family", initial: "R", angle: 210, delay: 3.2 },
] as const;

/**
 * The care circle as a motion graphic: the elder at the centre, the people they chose on a slow orbit,
 * and light travelling outward along each connection. Decorative; the section text says the same in words.
 */
export function CircleOrbit() {
  return (
    <div className="ld-orbit" aria-hidden="true">
      <span className="ld-orbit__ring ld-orbit__ring--outer" />
      <span className="ld-orbit__ring" />
      <div className="ld-orbit__spin">
        {MEMBERS.map((m) => (
          <span
            key={`${m.label}-${m.initial}`}
            className="ld-orbit__arm"
            style={{ "--a": `${m.angle}deg`, "--d": `${m.delay}s` } as CSSProperties}
          >
            <span className="ld-orbit__node">
              <span className="ld-orbit__face">
                <span className="ld-orbit__avatar">{m.initial}</span>
                <span className="ld-orbit__label">{m.label}</span>
              </span>
            </span>
          </span>
        ))}
      </div>
      <div className="ld-orbit__core">
        <Mark size={30} />
        <span>Elder</span>
      </div>
    </div>
  );
}
