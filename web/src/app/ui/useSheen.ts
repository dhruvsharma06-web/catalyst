/**
 * Callback ref that feeds a pointer-follow sheen to a surface (CSS vars --mx / --my).
 * Updates are rAF-throttled and only run for fine hover pointers when motion is allowed.
 */
export function sheenRef(el: HTMLElement | null): (() => void) | undefined {
  if (!el || typeof window === "undefined" || typeof window.matchMedia !== "function") return undefined;
  const fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  const calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (!fine || calm) return undefined;

  let frame = 0;
  let x = 0;
  let y = 0;
  const paint = (): void => {
    frame = 0;
    el.style.setProperty("--mx", `${x}px`);
    el.style.setProperty("--my", `${y}px`);
  };
  const onMove = (e: PointerEvent): void => {
    const box = el.getBoundingClientRect();
    x = e.clientX - box.left;
    y = e.clientY - box.top;
    if (frame === 0) frame = requestAnimationFrame(paint);
  };
  el.addEventListener("pointermove", onMove, { passive: true });
  return () => {
    el.removeEventListener("pointermove", onMove);
    if (frame !== 0) cancelAnimationFrame(frame);
  };
}
