import { motion, useReducedMotion, useScroll, useTransform } from "motion/react";
import { useRef } from "react";
import { Cta, SPRING } from "./ui";
import { Phone } from "./Phone";

const LINES = ["Care that", "stays close."] as const;

export function Hero() {
  const reduced = useReducedMotion();
  const sectionRef = useRef<HTMLElement>(null);
  // Cinematic pull-out: as the hero scrolls away, the copy lifts and defocuses while the phone dollies back.
  const { scrollYProgress } = useScroll({ target: sectionRef, offset: ["start start", "end start"] });
  const copyY = useTransform(scrollYProgress, [0, 1], [0, -90]);
  const copyOpacity = useTransform(scrollYProgress, [0, 0.75], [1, 0]);
  const copyBlur = useTransform(scrollYProgress, [0, 0.75], ["blur(0px)", "blur(10px)"]);
  const phoneScale = useTransform(scrollYProgress, [0, 1], [1, 0.86]);
  const phoneTilt = useTransform(scrollYProgress, [0, 1], [0, 14]);
  const phoneY = useTransform(scrollYProgress, [0, 1], [0, 70]);
  const enter = (delay: number) =>
    reduced
      ? { initial: false as const }
      : {
          initial: { opacity: 0, y: 24, filter: "blur(8px)" },
          animate: { opacity: 1, y: 0, filter: "blur(0px)" },
          transition: { ...SPRING, delay },
        };

  return (
    <section ref={sectionRef} className="ld-hero" aria-labelledby="ld-hero-title">
      <motion.div
        className="ld-hero__copy"
        style={reduced ? undefined : { y: copyY, opacity: copyOpacity, filter: copyBlur }}
      >
        <h1 id="ld-hero-title" className="ld-display">
          {LINES.map((line, i) => (
            <span key={line} className="ld-line">
              <motion.span
                className="ld-line__inner"
                initial={reduced ? false : { y: "115%" }}
                animate={{ y: "0%" }}
                transition={{ type: "spring", stiffness: 70, damping: 16, delay: 0.2 + i * 0.14 }}
              >
                {line}
              </motion.span>{" "}
            </span>
          ))}
        </h1>
        <motion.p className="ld-lede" {...enter(0.62)}>
          One shared, passcode-protected care circle. The elder stays in charge, and family hears when a
          dose is missed.
        </motion.p>
        <motion.div className="ld-actions" {...enter(0.78)}>
          <Cta to="/app?start=1" variant="primary" magnetic>
            Start a care circle
          </Cta>
          <Cta to="/app?join=1" variant="glass">
            Join with a code
          </Cta>
        </motion.div>
      </motion.div>
      <motion.div
        className="ld-hero__visual"
        style={reduced ? undefined : { scale: phoneScale, rotateX: phoneTilt, y: phoneY, transformPerspective: 1400 }}
      >
        <Phone />
      </motion.div>
    </section>
  );
}
