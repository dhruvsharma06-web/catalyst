import { useId, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes } from "react";

interface FieldProps {
  label: string;
  hint?: ReactNode;
  error?: string | undefined;
  optional?: boolean;
  children: (props: { id: string; "aria-describedby": string | undefined; "aria-invalid": true | undefined }) => ReactNode;
}

/** Label + control + hint + error wiring shared by every form control. */
export function Field({ label, hint, error, optional, children }: FieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint ? hintId : "", error ? errId : ""].filter(Boolean).join(" ") || undefined;
  return (
    <div className={`hx-field${error ? " hx-field--error" : ""}`}>
      <label htmlFor={id} className="hx-field__label">
        {label}
        {optional && <span className="hx-field__optional"> (optional)</span>}
      </label>
      {children({ id, "aria-describedby": describedBy, "aria-invalid": error ? true : undefined })}
      {hint && (
        <p id={hintId} className="hx-field__hint">
          {hint}
        </p>
      )}
      {error && (
        <p id={errId} className="hx-field__error">
          {error}
        </p>
      )}
    </div>
  );
}

type BaseFieldProps = Pick<FieldProps, "label" | "hint" | "error" | "optional">;

export function TextField({ label, hint, error, optional, ...input }: BaseFieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {(a11y) => <input {...input} {...a11y} className={`hx-input ${input.className ?? ""}`.trim()} />}
    </Field>
  );
}

export function SelectField({
  label,
  hint,
  error,
  optional,
  children,
  ...select
}: BaseFieldProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Field label={label} hint={hint} error={error} optional={optional}>
      {(a11y) => (
        <select {...select} {...a11y} className="hx-input hx-select">
          {children}
        </select>
      )}
    </Field>
  );
}

/** Toggle switch with a visible text label. */
export function Switch({
  label,
  description,
  ...input
}: { label: string; description?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "role">) {
  const id = useId();
  return (
    <div className="hx-switch">
      <input {...input} id={id} type="checkbox" role="switch" className="hx-switch__input" aria-describedby={description ? `${id}-d` : undefined} />
      <label htmlFor={id} className="hx-switch__label">
        <span className="hx-switch__track" aria-hidden="true">
          <span className="hx-switch__thumb" />
        </span>
        <span>
          {label}
          {description && (
            <span id={`${id}-d`} className="hx-switch__desc">
              {description}
            </span>
          )}
        </span>
      </label>
    </div>
  );
}
