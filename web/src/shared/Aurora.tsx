import "./aurora.css";

interface AuroraProps {
  /** "vivid" for the landing page, "calm" behind the app where text density is higher. */
  intensity?: "vivid" | "calm";
}

/**
 * Fixed, decorative aurora light behind the glass surfaces. Pure CSS: a few blurred
 * gradient fields drifting on the compositor, plus film grain. Static under reduced motion.
 */
export function Aurora({ intensity = "vivid" }: AuroraProps) {
  return (
    <div className={`aurora aurora--${intensity}`} aria-hidden="true">
      <span className="aurora__field aurora__field--ember" />
      <span className="aurora__field aurora__field--rose" />
      <span className="aurora__field aurora__field--teal" />
      <span className="aurora__field aurora__field--amber" />
      <span className="aurora__grain" />
    </div>
  );
}
