import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, type KeyboardEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconButton } from "./Button";

const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

let scrollLocks = 0;

export interface ModalProps {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  children: ReactNode;
  footer?: ReactNode;
  /** "sheet" docks to the bottom edge on small screens. */
  variant?: "dialog" | "sheet";
}

/** Accessible modal: focus trap, Esc to close, focus returns to the opener. */
export function Modal({ open, onClose, title, description, children, footer, variant = "dialog" }: ModalProps) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const descId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    scrollLocks++;
    document.body.style.overflow = "hidden";
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const body = panel.querySelector<HTMLElement>(".hx-modal__body");
      const target = panel.querySelector<HTMLElement>("[data-autofocus]") ?? body?.querySelector<HTMLElement>(FOCUSABLE);
      (target ?? panel).focus();
    });
    return () => {
      cancelAnimationFrame(frame);
      scrollLocks--;
      if (scrollLocks === 0) document.body.style.overflow = "";
      opener?.focus();
    };
  }, [open]);

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    if (e.key === "Escape") {
      e.stopPropagation();
      onCloseRef.current();
      return;
    }
    if (e.key !== "Tab") return;
    const items = Array.from(panelRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) {
      e.preventDefault();
      return;
    }
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  };

  const dur = reduce ? 0 : 0.2;
  const spring = reduce ? { duration: 0 } : { type: "spring" as const, stiffness: 420, damping: 36, mass: 0.9 };
  const sheet = variant === "sheet";

  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="overlay"
          className="hx-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: dur * 0.7 } }}
          transition={{ duration: dur }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose();
          }}
        >
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            aria-describedby={description ? descId : undefined}
            tabIndex={-1}
            className={`hx-modal hx-modal--${variant}`}
            onKeyDown={onKeyDown}
            initial={reduce ? false : sheet ? { opacity: 0, y: 56, scale: 0.98 } : { opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: sheet ? 32 : 6, scale: 0.98, transition: { duration: 0.14, ease: [0.23, 1, 0.32, 1] } }}
            transition={spring}
          >
            <header className="hx-modal__head">
              <h2 id={titleId} className="hx-modal__title">
                {title}
              </h2>
              <IconButton label="Close" icon="close" onClick={onClose} />
            </header>
            {description && (
              <p id={descId} className="hx-modal__desc">
                {description}
              </p>
            )}
            <div className="hx-modal__body">{children}</div>
            {footer && <footer className="hx-modal__foot">{footer}</footer>}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
