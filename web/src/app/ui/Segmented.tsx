import { motion, useReducedMotion } from "motion/react";
import { useId, useRef, type KeyboardEvent } from "react";

export interface SegmentOption<V extends string | number> {
  value: V;
  label: string;
}

interface Props<V extends string | number> {
  label: string;
  value: V;
  options: readonly SegmentOption<V>[];
  onChange: (value: V) => void;
  /** "tabs" renders a tablist wired to a panel with id `${idBase}-panel`. */
  mode?: "radio" | "tabs";
  idBase?: string;
}

export const tabId = (idBase: string, value: string | number): string => `${idBase}-tab-${value}`;
export const panelId = (idBase: string): string => `${idBase}-panel`;

/** Glass segmented control with roving focus and arrow-key selection. */
export function Segmented<V extends string | number>({ label, value, options, onChange, mode = "radio", idBase = "seg" }: Props<V>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const isTabs = mode === "tabs";
  const reduce = useReducedMotion();
  const thumbId = `seg-thumb-${useId()}`;

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const index = options.findIndex((o) => o.value === value);
    let next = index;
    if (e.key === "ArrowRight" || e.key === "ArrowDown") next = (index + 1) % options.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp") next = (index - 1 + options.length) % options.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = options.length - 1;
    else return;
    e.preventDefault();
    const target = options[next];
    if (target) {
      onChange(target.value);
      refs.current[next]?.focus();
    }
  };

  return (
    <div
      className="hx-segmented"
      role={isTabs ? "tablist" : "radiogroup"}
      aria-label={label}
      onKeyDown={onKeyDown}
      style={{ gridTemplateColumns: `repeat(${options.length}, 1fr)` }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role={isTabs ? "tab" : "radio"}
            aria-checked={isTabs ? undefined : selected}
            aria-selected={isTabs ? selected : undefined}
            aria-controls={isTabs ? panelId(idBase) : undefined}
            id={isTabs ? tabId(idBase, o.value) : undefined}
            tabIndex={selected ? 0 : -1}
            className={`hx-segmented__item${selected ? " is-selected" : ""}`}
            onClick={() => onChange(o.value)}
          >
            {selected && (
              <motion.span
                layoutId={thumbId}
                className="hx-segmented__thumb"
                aria-hidden="true"
                transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.38, bounce: 0.18 }}
              />
            )}
            <span className="hx-segmented__label">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
