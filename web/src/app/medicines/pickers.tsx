import { useId } from "react";
import type { PillColor, PillShape } from "../../api/types";
import { Button, IconButton, PILL_COLORS, PILL_SHAPES, PillSwatch } from "../ui";
import { ALL_DAYS, DAY_LABELS } from "../util/format";

/** One or more time inputs with add / remove. */
export function TimesEditor({ times, onChange, error }: { times: string[]; onChange: (t: string[]) => void; error?: string | undefined }) {
  const id = useId();
  return (
    <fieldset className="hx-fieldset" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="hx-field__label">Times of day</legend>
      <ul className="hx-times">
        {times.map((t, i) => (
          <li key={i}>
            <label className="visually-hidden" htmlFor={`${id}-${i}`}>
              {`Time ${i + 1}`}
            </label>
            <input
              id={`${id}-${i}`}
              type="time"
              className="hx-input"
              value={t}
              aria-invalid={error ? true : undefined}
              onChange={(e) => onChange(times.map((x, j) => (j === i ? e.target.value : x)))}
            />
            <IconButton label={`Remove time ${i + 1}`} icon="close" onClick={() => onChange(times.filter((_, j) => j !== i))} />
          </li>
        ))}
      </ul>
      {times.length < 8 && (
        <Button icon="plus" onClick={() => onChange([...times, "12:00"])}>
          Add another time
        </Button>
      )}
      {error && (
        <p id={`${id}-err`} className="hx-field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

/** Weekday toggles with an "Every day" shortcut. */
export function DaysPicker({ days, onChange, error }: { days: number[]; onChange: (d: number[]) => void; error?: string | undefined }) {
  const id = useId();
  const everyDay = days.length === 7;
  const toggle = (d: number): void => onChange(days.includes(d) ? days.filter((x) => x !== d) : [...days, d].sort((a, b) => a - b));
  return (
    <fieldset className="hx-fieldset" aria-describedby={error ? `${id}-err` : undefined}>
      <legend className="hx-field__label">Days</legend>
      <div className="hx-days">
        <button type="button" className="hx-daychip hx-daychip--all" aria-pressed={everyDay} onClick={() => onChange(everyDay ? [] : [...ALL_DAYS])}>
          Every day
        </button>
        {ALL_DAYS.map((d) => (
          <button key={d} type="button" className="hx-daychip" aria-pressed={days.includes(d)} onClick={() => toggle(d)}>
            {DAY_LABELS[d]}
          </button>
        ))}
      </div>
      {error && (
        <p id={`${id}-err`} className="hx-field__error">
          {error}
        </p>
      )}
    </fieldset>
  );
}

interface PillPickerProps {
  color: PillColor;
  shape: PillShape;
  onColor: (c: PillColor) => void;
  onShape: (s: PillShape) => void;
}

/** Colour and shape chosen as enamel pills; radios keep it keyboard friendly. */
export function PillPicker({ color, shape, onColor, onShape }: PillPickerProps) {
  const name = useId();
  return (
    <div className="hx-pillpicker">
      <fieldset className="hx-fieldset">
        <legend className="hx-field__label">What colour is it?</legend>
        <div className="hx-choices">
          {PILL_COLORS.map((c) => (
            <label key={c} className="hx-choice">
              <input type="radio" name={`${name}-color`} checked={color === c} onChange={() => onColor(c)} />
              <PillSwatch color={c} shape={shape} size="md" />
              <span className="visually-hidden">{c}</span>
            </label>
          ))}
        </div>
      </fieldset>
      <fieldset className="hx-fieldset">
        <legend className="hx-field__label">What shape is it?</legend>
        <div className="hx-choices">
          {PILL_SHAPES.map((s) => (
            <label key={s} className="hx-choice hx-choice--shape">
              <input type="radio" name={`${name}-shape`} checked={shape === s} onChange={() => onShape(s)} />
              <PillSwatch color={color} shape={s} size="md" />
              <span>{s}</span>
            </label>
          ))}
        </div>
      </fieldset>
    </div>
  );
}
