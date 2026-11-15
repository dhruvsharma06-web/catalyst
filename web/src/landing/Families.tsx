import type { ReactNode } from "react";
import { Glass, Reveal } from "./ui";

const EMAILS = [
  { tone: "var(--info)", kind: "Upcoming", line: "Metformin 500 mg is due at 8:00." },
  { tone: "var(--danger)", kind: "Missed", line: "Atorvastatin 10 mg was due at 21:00 and is not marked taken." },
  { tone: "var(--warning)", kind: "Appointment", line: "Dr. Rao, Thursday at 10:30." },
] as const;

const WEEK = [
  { d: "M", on: true },
  { d: "T", on: false },
  { d: "W", on: true },
  { d: "T", on: true },
  { d: "F", on: true },
  { d: "S", on: true },
  { d: "S", on: true },
] as const;

const LOG = [
  { who: "Elder", what: "marked Amlodipine taken" },
  { who: "Caretaker", what: "moved Atorvastatin to 21:00" },
  { who: "Family", what: "added a Thursday appointment" },
] as const;

function Tile({ className, children, delay }: { className: string; children: ReactNode; delay: number }) {
  return (
    <Reveal kind="panel" delay={delay} className={`ld-tile-slot ${className}`}>
      <Glass as="article" className="ld-tile" lift>
        {children}
      </Glass>
    </Reveal>
  );
}

export function Families() {
  return (
    <section id="families" className="ld-section ld-families" aria-labelledby="ld-fam-title">
      <Reveal className="ld-families__head">
        <h2 id="ld-fam-title" className="ld-h2">
          For the people who care from further away.
        </h2>
        <p className="ld-body">
          Everyone sees the same schedule. Hearth does the nudging by email, so the family does not have to chase.
        </p>
      </Reveal>
      <div className="ld-bento">
        <Tile className="ld-bento__mail" delay={0}>
          <h3>Email reminders</h3>
          <p className="ld-tile__sub">Upcoming doses, missed doses and visits.</p>
          <ul className="ld-emails">
            {EMAILS.map((e) => (
              <li key={e.kind} className="ld-email">
                <span className="ld-email__dot" style={{ background: e.tone }} aria-hidden="true" />
                <span>
                  <strong>{e.kind}</strong>
                  <span>{e.line}</span>
                </span>
              </li>
            ))}
          </ul>
        </Tile>
        <Tile className="ld-bento__week" delay={0.06}>
          <h3>Weekly care summary</h3>
          <p className="ld-tile__tag">Example</p>
          <div className="ld-week" aria-hidden="true">
            {WEEK.map((w, i) => (
              <span key={i} className={w.on ? "is-on" : ""}>
                {w.d}
              </span>
            ))}
          </div>
          <p className="ld-tile__sub">A short, readable recap for family: what went well, and where a call might help.</p>
        </Tile>
        <Tile className="ld-bento__log" delay={0.1}>
          <h3>Activity log</h3>
          <ul className="ld-log">
            {LOG.map((l) => (
              <li key={l.who}>
                <strong>{l.who}</strong> {l.what}
              </li>
            ))}
          </ul>
        </Tile>
        <Tile className="ld-bento__cal" delay={0.14}>
          <div className="ld-cal">
            <div className="ld-cal__date" aria-hidden="true">
              <span>Thu</span>
              <strong>10:30</strong>
            </div>
            <div>
              <h3>Add it to Google Calendar</h3>
              <p className="ld-tile__sub">Every appointment exports as an .ics file that opens straight in your calendar.</p>
            </div>
          </div>
        </Tile>
      </div>
    </section>
  );
}
