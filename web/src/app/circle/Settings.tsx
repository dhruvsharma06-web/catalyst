import { useState, type FormEvent } from "react";
import { changePasscode, updateMe } from "../../api/client";
import { errorMessage, fieldErrors } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { NotifyPrefs } from "../../api/types";
import { useSession } from "../session";
import { Button, Card, Switch, TextField, useToast } from "../ui";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function PreferencesCard() {
  const { me, setMember } = useSession();
  const toast = useToast();
  const [email, setEmail] = useState(me.member.email ?? "");
  const [notify, setNotify] = useState<NotifyPrefs>(me.member.notify);
  const [localError, setLocalError] = useState<string>();

  const save = useAction(async () => {
    const saved = await updateMe({ email: email.trim() || null, notify });
    setMember(saved);
    toast.notify("Your reminder settings are saved");
  });

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    if (email.trim() && !EMAIL.test(email.trim())) {
      setLocalError("That email address doesn't look right.");
      return;
    }
    setLocalError(undefined);
    await save.run();
  };

  const server = save.error ? fieldErrors(save.error) : {};
  const flip = (k: keyof NotifyPrefs) => (e: { target: { checked: boolean } }): void => setNotify((p) => ({ ...p, [k]: e.target.checked }));

  return (
    <Card className="hx-block" aria-labelledby="prefs-title">
      <h2 id="prefs-title" className="hx-section-title">
        Your email reminders
      </h2>
      <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField
          label="Your email"
          optional
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={localError ?? server["email"]}
          hint="Reminders are sent here. Without an email, you won't get any."
        />
        <fieldset className="hx-fieldset">
          <legend className="hx-field__label">Email me when</legend>
          <Switch label="A dose is coming up" checked={notify.doses} onChange={flip("doses")} />
          <Switch label="A dose was missed" checked={notify.missed} onChange={flip("missed")} />
          <Switch label="An appointment is coming up" checked={notify.appointments} onChange={flip("appointments")} />
        </fieldset>
        {Boolean(save.error) && Object.keys(server).length === 0 && (
          <p role="alert" className="hx-form-error">
            {errorMessage(save.error)}
          </p>
        )}
        <Button type="submit" loading={save.pending}>
          {save.pending ? "Saving…" : "Save reminder settings"}
        </Button>
      </form>
    </Card>
  );
}

export function PasscodeCard() {
  const toast = useToast();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});

  const save = useAction(async () => {
    await changePasscode({ currentPasscode: current, newPasscode: next });
    setCurrent("");
    setNext("");
    setConfirm("");
    toast.notify("Passcode changed. Share the new one with your family.");
  });

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found: Record<string, string> = {};
    if (!current) found["current"] = "Enter your current passcode.";
    if (next.length < 6) found["next"] = "Use at least 6 characters.";
    else if (next.length > 64) found["next"] = "Use 64 characters or fewer.";
    if (confirm !== next) found["confirm"] = "The passcodes don't match.";
    setErrors(found);
    if (Object.keys(found).length === 0) await save.run();
  };

  const server = save.error ? fieldErrors(save.error) : {};
  return (
    <Card className="hx-block" aria-labelledby="pass-title">
      <h2 id="pass-title" className="hx-section-title">
        Change the circle passcode
      </h2>
      <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
        <TextField label="Current passcode" type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} error={errors["current"] ?? server["currentPasscode"]} />
        <TextField label="New passcode" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} error={errors["next"] ?? server["newPasscode"]} hint="At least 6 characters." />
        <TextField label="Type the new passcode again" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} error={errors["confirm"]} />
        {Boolean(save.error) && Object.keys(server).length === 0 && (
          <p role="alert" className="hx-form-error">
            {errorMessage(save.error)}
          </p>
        )}
        <Button type="submit" loading={save.pending}>
          {save.pending ? "Changing…" : "Change passcode"}
        </Button>
      </form>
    </Card>
  );
}
