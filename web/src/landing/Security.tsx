import { Glass, Reveal } from "./ui";

const FACTS = [
  "Passcodes are hashed with scrypt. They are never stored in plain text.",
  "Sessions use httpOnly cookies, so scripts on the page cannot read them.",
  "Access is rate-limited, and each circle locks after repeated wrong passcodes.",
  "Your data is stored in Google Cloud Firestore.",
  "No ads. No selling of data.",
] as const;

const STACK = ["Google Cloud Run", "Firestore", "Gemini", "Cloud Scheduler"] as const;

export function Security() {
  return (
    <section id="security" className="ld-section ld-security" aria-labelledby="ld-sec-title">
      <Reveal className="ld-security__head">
        <h2 id="ld-sec-title" className="ld-h2">
          A family's routine deserves careful handling.
        </h2>
        <p className="ld-body">Plain facts about how access and data are protected.</p>
        <ul className="ld-stack-chips" aria-label="Built on">
          {STACK.map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      </Reveal>
      <Reveal kind="panel" delay={0.08}>
        <Glass className="ld-security__panel">
          <ul className="ld-facts">
            {FACTS.map((f) => (
              <li key={f}>
                <svg viewBox="0 0 16 16" width="18" height="18" aria-hidden="true" focusable="false">
                  <path d="M3.5 8.5l3 3 6-7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </Glass>
      </Reveal>
    </section>
  );
}
