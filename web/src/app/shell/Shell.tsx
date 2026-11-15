import { AnimatePresence, animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { useEffect, useRef, type ReactNode, type RefObject } from "react";
import { NavLink, useLocation, useOutlet } from "react-router";
import { Mark } from "../../shared/Mark";
import { useSession } from "../session";
import { useElderMode } from "../useElderMode";
import { Button, Icon, type IconName } from "../ui";
import { ROLE_LABEL } from "../util/format";

const NAV: { to: string; label: string; icon: IconName }[] = [
  { to: "/app/today", label: "Today", icon: "home" },
  { to: "/app/medicines", label: "Medicines", icon: "pill" },
  { to: "/app/appointments", label: "Appointments", icon: "calendar" },
  { to: "/app/circle", label: "Circle", icon: "people" },
  { to: "/app/insights", label: "Progress", icon: "chart" },
];

/** Floating glass header, glass navigation with a sliding indicator, and the routed screen. */
export function Shell() {
  const { me, signOut, switchCircle } = useSession();
  const elder = useElderMode(me.member.role);
  const reduce = useReducedMotion();
  const { pathname } = useLocation();
  const outlet = useOutlet();
  const mainRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const item = NAV.find((n) => pathname.startsWith(n.to));
    document.title = `${item?.label ?? "Hearth"} · Hearth`;
  }, [pathname]);

  return (
    <div className="hx-shell">
      <a className="skip-link" href="#main">
        Skip to content
      </a>
      <header className="hx-header">
        <div className="hx-header__brand">
          <span className="hx-header__logo"><Mark size={36} /></span>
          <div>
            <p className="hx-header__name">Hearth</p>
            <button type="button" className="hx-header__circle" onClick={switchCircle} aria-label={`${me.circle.elderName}'s circle. Switch circle`}>
              {me.circle.elderName}'s circle
              <Icon name="swap" size={14} />
            </button>
          </div>
        </div>
        <div className="hx-header__tools">
          <p className="hx-chip">
            <span>{me.member.name}</span>
            <span className="hx-chip__role">{ROLE_LABEL[me.member.role]}</span>
          </p>
          <button type="button" className="hx-toggle" aria-pressed={elder.enabled} onClick={elder.toggle}>
            <Icon name="sun" size={18} />
            <span>Large text: {elder.enabled ? "On" : "Off"}</span>
          </button>
          <Button variant="ghost" icon="logout" onClick={() => void signOut()}>
            Sign out
          </Button>
        </div>
      </header>

      <nav className="hx-nav" aria-label="Primary">
        <ul>
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} className="hx-nav__link">
                {({ isActive }) => (
                  <>
                    {isActive && (
                      <motion.span
                        layoutId="hx-nav-pill"
                        className="hx-nav__pill"
                        aria-hidden="true"
                        transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.42, bounce: 0.2 }}
                      />
                    )}
                    <Icon name={n.icon} size={22} />
                    <span>{n.label}</span>
                  </>
                )}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>

      <main id="main" ref={mainRef} tabIndex={-1} className="hx-main">
        <AnimatePresence mode="wait" initial={false}>
          <RouteFrame key={pathname} mainRef={mainRef} reduce={reduce === true}>
            {outlet}
          </RouteFrame>
        </AnimatePresence>
      </main>
    </div>
  );
}

/**
 * One routed screen. Fades and rises in with a short blur-in; once it has mounted it moves focus
 * to the new screen's heading (the first screen load keeps the browser's default focus).
 */
function RouteFrame({ children, mainRef, reduce }: { children: ReactNode; mainRef: RefObject<HTMLElement | null>; reduce: boolean }) {
  const blur = useMotionValue(reduce ? 0 : 6);
  const filter = useTransform(blur, (v) => (v < 0.05 ? "none" : `blur(${v}px)`));
  const seen = useRef(false);

  useEffect(() => {
    const controls = reduce ? undefined : animate(blur, 0, { duration: 0.26, ease: [0.23, 1, 0.32, 1] });
    if (seen.current) {
      const heading = mainRef.current?.querySelector<HTMLElement>("h1");
      (heading ?? mainRef.current)?.focus({ preventScroll: false });
    }
    seen.current = true;
    return () => controls?.stop();
  }, [blur, mainRef, reduce]);

  return (
    <motion.div
      className="hx-route"
      style={{ filter }}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, transition: { duration: reduce ? 0 : 0.1 } }}
      transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.34, bounce: 0.12 }}
    >
      {children}
    </motion.div>
  );
}
