import { Link } from "react-router";
import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { Mark } from "../shared/Mark";
import { Glass } from "./ui";

const LINKS = [
  { href: "#how", label: "How it works" },
  { href: "#elder", label: "Elder mode" },
  { href: "#families", label: "Families" },
  { href: "#security", label: "Security" },
] as const;

/** Floating glass pill, detached from the top edge; it tightens slightly once you scroll. */
export function Nav() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const scale = useTransform(scrollY, [0, 160], [1, 0.95]);
  const lift = useTransform(scrollY, [0, 160], [0, -4]);
  return (
    <header className="ld-nav-wrap">
      <motion.div
        className="ld-nav-shell"
        style={reduced ? undefined : { scale, y: lift }}
        initial={reduced ? false : { opacity: 0, y: -24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: "spring", stiffness: 120, damping: 20, delay: 0.1 }}
      >
        <Glass className="ld-nav">
          <Link to="/" className="ld-brand" aria-label="Hearth, home">
            <Mark size={28} />
            <span>Hearth</span>
          </Link>
          <nav aria-label="Primary" className="ld-nav__links">
            {LINKS.map((l) => (
              <a key={l.href} href={l.href} className="ld-nav__link">
                {l.label}
              </a>
            ))}
          </nav>
          <Link to="/app" className="ld-btn ld-btn--primary ld-btn--sm">
            Sign in
          </Link>
        </Glass>
      </motion.div>
    </header>
  );
}
