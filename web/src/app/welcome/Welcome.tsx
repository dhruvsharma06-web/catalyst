import { useState, type FormEvent } from "react";
import { useSearchParams } from "react-router";
import { createCircle, joinCircle, openCircle } from "../../api/client";
import { detectTimeZone } from "../../api/datetime";
import { errorMessage, fieldErrors } from "../../api/errors";
import { useAction } from "../../api/hooks";
import type { Account, Me, Role } from "../../api/types";
import { Mark } from "../../shared/Mark";
import { Button, Card, Icon, Segmented, TextField, panelId, tabId } from "../ui";
import { ROLE_LABEL } from "../util/format";
import { copyToClipboard } from "../util/storage";
import { PASSCODE_MIN, secretStrength, validateCreate, validateJoin, type CreateValues, type Errors, type JoinValues } from "./validation";

type Tab = "create" | "join";

const ROLE_OPTIONS = [
  { value: "elder", label: "The elder" },
  { value: "caretaker", label: "Caretaker" },
  { value: "family", label: "Family" },
] as const;

interface HubProps {
  account: Account;
  onOpen: (me: Me) => void;
  onSignOut: () => void;
}

/** After sign-in: open an existing circle, start a new one, or join with a code. */
export function CircleHub({ account, onOpen, onSignOut }: HubProps) {
  const [params] = useSearchParams();
  const [tab, setTab] = useState<Tab>(params.get("join") === "1" ? "join" : "create");
  const [created, setCreated] = useState<Me | null>(null);
  const open = useAction(async (circleId: string) => onOpen(await openCircle(circleId)));
  const first = account.user.name.split(/\s+/)[0] ?? account.user.name;

  if (created) return <CodePanel me={created} onContinue={() => onOpen(created)} />;

  return (
    <main className="hx-welcome" id="main">
      <Card className="hx-welcome__card">
        <header className="hx-welcome__head">
          <span className="hx-header__logo hx-header__logo--lg">
            <Mark size={44} />
          </span>
          <h1>Hi, {first}</h1>
          <p>{account.circles.length ? "Open a circle, or start another." : "Start a care circle, or join one with a code."}</p>
        </header>

        {account.circles.length > 0 && (
          <section aria-labelledby="hub-circles" className="hx-hub">
            <h2 id="hub-circles" className="hx-hub__title">
              Your circles
            </h2>
            <ul className="hx-hub__list">
              {account.circles.map(({ circle, role }) => (
                <li key={circle.id}>
                  <button
                    type="button"
                    className="hx-hub__item"
                    onClick={() => void open.run(circle.id)}
                    disabled={open.pending}
                    aria-label={`Open ${circle.elderName}'s circle`}
                  >
                    <span className="hx-hub__avatar" aria-hidden="true">
                      {circle.elderName.slice(0, 1).toUpperCase()}
                    </span>
                    <span className="hx-hub__text">
                      <strong>{circle.elderName}</strong>
                      <span>{ROLE_LABEL[role]}</span>
                    </span>
                    <Icon name="chevron" />
                  </button>
                </li>
              ))}
            </ul>
            {Boolean(open.error) && (
              <p role="alert" className="hx-form-error">
                {errorMessage(open.error)}
              </p>
            )}
          </section>
        )}

        <Segmented
          label="Start or join a circle"
          mode="tabs"
          idBase="welcome"
          value={tab}
          onChange={setTab}
          options={[
            { value: "create", label: "Start a circle" },
            { value: "join", label: "Join with a code" },
          ]}
        />
        <div role="tabpanel" id={panelId("welcome")} aria-labelledby={tabId("welcome", tab)} className="hx-welcome__panel">
          {tab === "create" ? <CreateForm onCreated={setCreated} /> : <JoinForm onJoined={onOpen} />}
        </div>
        <p className="hx-welcome__foot">
          Signed in as {account.user.email} ·{" "}
          <button type="button" className="hx-linkbtn" onClick={onSignOut}>
            Sign out
          </button>
        </p>
      </Card>
    </main>
  );
}

function CreateForm({ onCreated }: { onCreated: (me: Me) => void }) {
  const [v, setV] = useState<CreateValues>({ elderName: "", role: "caretaker", timezone: detectTimeZone(), passcode: "", confirm: "" });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof CreateValues>(k: K, val: CreateValues[K]): void => setV((p) => ({ ...p, [k]: val }));
  const submit = useAction(async () =>
    onCreated(await createCircle({ elderName: v.elderName.trim(), timezone: v.timezone, passcode: v.passcode, role: v.role })),
  );

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateCreate(v);
    setErrors(found);
    if (Object.keys(found).length === 0) await submit.run();
  };

  const server = submit.error ? fieldErrors(submit.error) : {};
  const err = (k: string): string | undefined => errors[k] ?? server[k];
  const strength = secretStrength(v.passcode, PASSCODE_MIN);

  return (
    <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TextField label="Who is this circle for?" value={v.elderName} onChange={(e) => set("elderName", e.target.value)} error={err("elderName")} autoComplete="off" maxLength={60} placeholder="Kamala Iyer" required />
      <RoleChoice value={v.role} onChange={(r) => set("role", r)} />
      <TextField label="Circle passcode" type="password" value={v.passcode} onChange={(e) => set("passcode", e.target.value)} error={err("passcode")} autoComplete="new-password" hint={`People join with the code and this passcode. ${strength.label}`} required />
      <TextField label="Confirm passcode" type="password" value={v.confirm} onChange={(e) => set("confirm", e.target.value)} error={err("confirm")} autoComplete="new-password" required />
      <details className="hx-more">
        <summary>More options</summary>
        <TextField label="Time zone" value={v.timezone} onChange={(e) => set("timezone", e.target.value)} error={err("timezone")} hint="Used to work out when each dose is due." />
      </details>
      {Boolean(submit.error) && Object.keys(server).length === 0 && (
        <p role="alert" className="hx-form-error">
          {errorMessage(submit.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block loading={submit.pending}>
        {submit.pending ? "Creating…" : "Create circle"}
      </Button>
    </form>
  );
}

function JoinForm({ onJoined }: { onJoined: (me: Me) => void }) {
  const [v, setV] = useState<JoinValues>({ code: "", passcode: "", role: "family" });
  const [errors, setErrors] = useState<Errors>({});
  const set = <K extends keyof JoinValues>(k: K, val: JoinValues[K]): void => setV((p) => ({ ...p, [k]: val }));
  const submit = useAction(async () =>
    onJoined(await joinCircle({ code: v.code.trim().toUpperCase(), passcode: v.passcode, role: v.role })),
  );

  const onSubmit = async (e: FormEvent): Promise<void> => {
    e.preventDefault();
    const found = validateJoin(v);
    setErrors(found);
    if (Object.keys(found).length === 0) await submit.run();
  };

  const server = submit.error ? fieldErrors(submit.error) : {};
  const err = (k: string): string | undefined => errors[k] ?? server[k];

  return (
    <form className="hx-form" onSubmit={(e) => void onSubmit(e)} noValidate>
      <TextField label="Circle code" value={v.code} onChange={(e) => set("code", e.target.value)} error={err("code")} autoCapitalize="characters" autoComplete="off" placeholder="MAPLE-4821" required />
      <TextField label="Circle passcode" type="password" value={v.passcode} onChange={(e) => set("passcode", e.target.value)} error={err("passcode")} autoComplete="off" hint="Ask the person who started the circle." required />
      <RoleChoice value={v.role} onChange={(r) => set("role", r)} />
      {Boolean(submit.error) && Object.keys(server).length === 0 && (
        <p role="alert" className="hx-form-error">
          {errorMessage(submit.error)}
        </p>
      )}
      <Button type="submit" variant="primary" size="lg" block loading={submit.pending}>
        {submit.pending ? "Joining…" : "Join circle"}
      </Button>
    </form>
  );
}

function RoleChoice({ value, onChange }: { value: Role; onChange: (r: Role) => void }) {
  return (
    <div className="hx-field">
      <span className="hx-field__label">You are</span>
      <Segmented label="You are" value={value} options={ROLE_OPTIONS} onChange={onChange} />
    </div>
  );
}

function CodePanel({ me, onContinue }: { me: Me; onContinue: () => void }) {
  const [copied, setCopied] = useState<"yes" | "no" | null>(null);
  const copy = async (): Promise<void> => setCopied((await copyToClipboard(me.circle.code)) ? "yes" : "no");

  return (
    <main className="hx-welcome" id="main">
      <Card className="hx-welcome__card hx-codepanel">
        <h1>Your circle is ready</h1>
        <p>Invite people to {me.circle.elderName}'s circle with this code.</p>
        <p className="hx-code" aria-label={`Circle code ${me.circle.code}`}>
          {me.circle.code}
        </p>
        <div className="hx-callout">
          <Icon name="warning" />
          <p>Send the code and the passcode in separate messages.</p>
        </div>
        <Button icon="copy" onClick={() => void copy()}>
          Copy code
        </Button>
        <p className="hx-codepanel__status" role="status">
          {copied === "yes" && "Code copied."}
          {copied === "no" && "Couldn't copy. Please select the code instead."}
        </p>
        <Button variant="primary" size="lg" block onClick={onContinue}>
          Continue
        </Button>
      </Card>
    </main>
  );
}
