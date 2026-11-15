import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type Tone = "info" | "error";
interface ToastItem {
  id: number;
  message: string;
  tone: Tone;
}

interface ToastApi {
  /** Announces politely (and shows a short-lived toast). */
  notify: (message: string) => void;
  /** Announces assertively for failures. */
  fail: (message: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside ToastProvider");
  return ctx;
}

/** Hosts the polite status region and the assertive alert region for async results. */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, ReturnType<typeof setTimeout>>());

  const push = useCallback((message: string, tone: Tone) => {
    const id = nextId.current++;
    setItems((prev) => [...prev.slice(-2), { id, message, tone }]);
    timers.current.set(
      id,
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
        timers.current.delete(id);
      }, tone === "error" ? 8000 : 5000),
    );
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => map.forEach((t) => clearTimeout(t));
  }, []);

  const reduce = useReducedMotion();
  const motionProps = reduce
    ? ({ initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0 } } as const)
    : ({
        initial: { opacity: 0, y: 16, scale: 0.96 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, scale: 0.96, transition: { duration: 0.14 } },
        transition: { type: "spring", duration: 0.4, bounce: 0.2 },
      } as const);

  const api = useMemo<ToastApi>(() => ({ notify: (m) => push(m, "info"), fail: (m) => push(m, "error") }), [push]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="hx-toasts">
        <div role="status" aria-live="polite" aria-atomic="false">
          <AnimatePresence initial={false}>
            {items.filter((t) => t.tone === "info").map((t) => (
              <motion.p key={t.id} layout={!reduce} className="hx-toast" {...motionProps}>
                {t.message}
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
        <div role="alert" aria-live="assertive" aria-atomic="false">
          <AnimatePresence initial={false}>
            {items.filter((t) => t.tone === "error").map((t) => (
              <motion.p key={t.id} layout={!reduce} className="hx-toast hx-toast--error" {...motionProps}>
                <Icon name="warning" size={18} />
                <span>{t.message}</span>
              </motion.p>
            ))}
          </AnimatePresence>
        </div>
      </div>
    </ToastContext.Provider>
  );
}
