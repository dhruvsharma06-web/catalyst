import { useState } from "react";
import { Link } from "react-router";
import { listMedications, listMembers } from "../../api/client";
import { useAsync } from "../../api/hooks";
import { useSession } from "../session";
import { Button, Card, Icon } from "../ui";
import { copyToClipboard, readStorage, writeStorage } from "../util/storage";

const DISMISS_KEY = "hearth.gettingStarted.dismissed";

/** First-run checklist. Completion comes from real data; only dismissal is stored. */
export function GettingStarted() {
  const { me } = useSession();
  const [dismissed, setDismissed] = useState(() => readStorage(DISMISS_KEY) === "true");
  const meds = useAsync((s) => listMedications(s), []);
  const members = useAsync((s) => listMembers(s), []);
  const [copied, setCopied] = useState(false);

  if (dismissed || !meds.data || !members.data) return null;

  const steps = [
    { done: meds.data.length > 0 },
    { done: members.data.length > 1 },
    { done: me.member.email !== null },
  ];
  if (steps.every((s) => s.done)) return null;

  const hide = (): void => {
    writeStorage(DISMISS_KEY, "true");
    setDismissed(true);
  };
  const copy = async (): Promise<void> => setCopied(await copyToClipboard(me.circle.code));

  return (
    <Card className="hx-start" aria-labelledby="start-title">
      <h2 id="start-title">Three quick steps to get started</h2>
      <ol className="hx-start__list">
        <li className={steps[0]?.done ? "is-done" : ""}>
          <StepMark done={steps[0]?.done ?? false} />
          <div>
            <p>Add your first medicine</p>
            {!steps[0]?.done && <Link to="/app/medicines">Go to Medicines</Link>}
          </div>
        </li>
        <li className={steps[1]?.done ? "is-done" : ""}>
          <StepMark done={steps[1]?.done ?? false} />
          <div>
            <p>Invite your family</p>
            {!steps[1]?.done && (
              <p className="hx-start__code">
                Share this code: <strong>{me.circle.code}</strong>{" "}
                <Button variant="ghost" icon="copy" onClick={() => void copy()}>
                  {copied ? "Copied" : "Copy"}
                </Button>
                <span className="hx-start__hint">Send the passcode in a separate message.</span>
              </p>
            )}
          </div>
        </li>
        <li className={steps[2]?.done ? "is-done" : ""}>
          <StepMark done={steps[2]?.done ?? false} />
          <div>
            <p>Add an email for reminders</p>
            {!steps[2]?.done && <Link to="/app/circle">Add my email</Link>}
          </div>
        </li>
      </ol>
      <Button variant="ghost" onClick={hide}>
        Hide this
      </Button>
    </Card>
  );
}

function StepMark({ done }: { done: boolean }) {
  return (
    <span className={`hx-start__mark${done ? " is-done" : ""}`}>
      {done ? <Icon name="check" size={16} /> : null}
      <span className="visually-hidden">{done ? "Done:" : "To do:"}</span>
    </span>
  );
}
