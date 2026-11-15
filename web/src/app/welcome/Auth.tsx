import { useState, type FormEvent } from "react";
import { login, signup } from "../../api/client";
import { errorMessage, fieldErrors } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { Account } from "../../api/types";
import { Mark } from "../../shared/Mark";
import { Button, Card, Segmented, TextField, panelId, tabId } from "../ui";
import { PASSWORD_MIN, secretStrength, validateLogin, validateSignup, type Errors } from "./validation";

type Mode = "signin" | "signup";

/** Authentication: every person has their own account before they can create or join a circle. */
export function AuthScreen({ onSignedIn, initialMode = "signin" }: { onSignedIn: (account: Account) => void; initialMode?: Mode }) {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <main className="hx-welcome" id="main">
      <Card className="hx-welcome__card">
        <header className="hx-welcome__head">
          <span className="hx-header__logo hx-header__logo--lg">
            <Mark size={44} />
          </span>
          <h1>{mode === "signin" ? "Welcome back" : "Create your account"}</h1>
          <p>{mode === "signin" ? "Sign in to see your care circles." : "One account for every circle you belong to."}</p>
        </header>
        <Segmented
          label="Sign in or create an account"
          mode="tabs"
          idBase="auth"
          value={mode}
          onChange={setMode}
          options={[
            { value: "signin", label: "Sign in" },
            { value: "signup", label: "Create account" },
          ]}
        />
        <div role="tabpanel" id={panelId("auth")} aria-labelledby={tabId("auth", mode)} className="hx-welcome__panel">
          {mode === "signin" ? <SignInForm onDone={onSignedIn} /> : <SignUpForm onDone={onSignedIn} />}
        </div>
      </Card>
    </main>
  );
}

function SignInForm({ onDone }: { onDone: (a: Account) => void }) {
  const [v, setV] = useState({ email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const submit = useAction(async () => onDone(await login({ email: v.email.trim(), password: v.password })));

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateLogin(v);
    setErrors(found);
    if (Object.keys(found).length === 0) await submit.run();
  };

  return (
    <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TextField label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} error={errors["email"]} autoComplete="email" required />
      <TextField label="Password" type="password" value={v.password} onChange={(e) => setV({ ...v, password: e.target.value })} error={errors["password"]} autoComplete="current-password" required />
      {Boolean(submit.error) && (
        <p role="alert" className="hx-form-error">
          {errorMessage(submit.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block loading={submit.pending}>
        {submit.pending ? "Signing in…" : "Sign in"}
      </Button>
    </form>
  );
}

function SignUpForm({ onDone }: { onDone: (a: Account) => void }) {
  const [v, setV] = useState({ name: "", email: "", password: "" });
  const [errors, setErrors] = useState<Errors>({});
  const submit = useAction(async () =>
    onDone(await signup({ name: v.name.trim(), email: v.email.trim(), password: v.password })),
  );

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateSignup(v);
    setErrors(found);
    if (Object.keys(found).length === 0) await submit.run();
  };

  const server = submit.error ? fieldErrors(submit.error) : {};
  const err = (k: string): string | undefined => errors[k] ?? server[k];
  const strength = secretStrength(v.password, PASSWORD_MIN);

  return (
    <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TextField label="Your name" value={v.name} onChange={(e) => setV({ ...v, name: e.target.value })} error={err("name")} autoComplete="name" maxLength={60} required />
      <TextField
        label="Email"
        type="email"
        value={v.email}
        onChange={(e) => setV({ ...v, email: e.target.value })}
        error={err("email")}
        autoComplete="email"
        hint="Reminders are sent here."
        required
      />
      <TextField
        label="Password"
        type="password"
        value={v.password}
        onChange={(e) => setV({ ...v, password: e.target.value })}
        error={err("password")}
        autoComplete="new-password"
        hint={strength.label}
        required
      />
      {Boolean(submit.error) && Object.keys(server).length === 0 && (
        <p role="alert" className="hx-form-error">
          {errorMessage(submit.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block loading={submit.pending}>
        {submit.pending ? "Creating account…" : "Create account"}
      </Button>
    </form>
  );
}
