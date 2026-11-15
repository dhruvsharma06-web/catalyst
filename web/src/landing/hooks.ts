import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { PointerEvent, RefObject } from "react";

/** Subscribe to a media query without re-implementing listeners in every component. */
export function useMatchMedia(query: string): boolean {
  const subscribe = useCallback(
    (notify: () => void) => {
      const mql = window.matchMedia(query);
      mql.addEventListener("change", notify);
      return () => mql.removeEventListener("change", notify);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

/**
 * Pointer-follow sheen: writes --mx / --my (px, element-relative) on the element,
 * at most once per animation frame. CSS paints the specular highlight from them.
 */
export function useSheen() {
  const frame = useRef(0);
  useEffect(() => () => cancelAnimationFrame(frame.current), []);
  return useCallback((event: PointerEvent<HTMLElement>) => {
    if (event.pointerType === "touch" || frame.current) return;
    const el = event.currentTarget;
    const { clientX, clientY } = event;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${Math.round(clientX - rect.left)}px`);
      el.style.setProperty("--my", `${Math.round(clientY - rect.top)}px`);
    });
  }, []);
}

/** True while the element is on screen and the tab is visible. Used to pause loops. */
export function useActive(ref: RefObject<Element | null>): boolean {
  const [visible, setVisible] = useState(false);
  const [tabVisible, setTabVisible] = useState(() => !document.hidden);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setVisible(Boolean(entry?.isIntersecting)), {
      threshold: 0.25,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref]);

  useEffect(() => {
    const onChange = () => setTabVisible(!document.hidden);
    document.addEventListener("visibilitychange", onChange);
    return () => document.removeEventListener("visibilitychange", onChange);
  }, []);

  return visible && tabVisible;
}
