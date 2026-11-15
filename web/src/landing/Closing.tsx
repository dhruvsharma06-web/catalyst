import { Link } from "react-router";
import { Mark } from "../shared/Mark";
import { Cta, Glass, Reveal } from "./ui";

export function FinalCta() {
  return (
    <section className="ld-section ld-final" aria-labelledby="ld-final-title">
      <Reveal kind="panel">
        <Glass className="ld-final__panel">
          <div className="ld-final__light" aria-hidden="true">
            <span className="ld-final__blob ld-final__blob--a" />
            <span className="ld-final__blob ld-final__blob--b" />
            <span className="ld-final__blob ld-final__blob--c" />
          </div>
          <h2 id="ld-final-title" className="ld-display ld-display--lg">
            Start with one code.
          </h2>
          <p className="ld-lede">Create a circle in a minute, then invite the people who help.</p>
          <div className="ld-actions">
            <Cta to="/app?start=1" variant="primary" magnetic>
              Start a care circle
            </Cta>
            <Cta to="/app?join=1" variant="glass">
              Join with a code
            </Cta>
          </div>
        </Glass>
      </Reveal>
    </section>
  );
}

export function Footer() {
  return (
    <footer className="ld-footer">
      <Link to="/" className="ld-brand" aria-label="Hearth, home">
        <Mark size={26} />
        <span>Hearth</span>
      </Link>
      <p>Not a substitute for professional medical advice.</p>
    </footer>
  );
}
