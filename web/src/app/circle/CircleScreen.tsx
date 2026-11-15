import { useState } from "react";
import { useSession } from "../session";
import { Button, Card } from "../ui";
import { copyToClipboard } from "../util/storage";
import { ActivityCard, EmailsCard } from "./Feeds";
import { MembersCard } from "./MembersCard";
import { PasscodeCard, PreferencesCard } from "./Settings";

export function CircleScreen() {
  const { me } = useSession();
  const [copied, setCopied] = useState(false);
  const copy = async (): Promise<void> => setCopied(await copyToClipboard(me.circle.code));

  return (
    <div className="hx-screen">
      <header className="hx-pagehead">
        <div>
          <h1>Circle</h1>
          <p className="hx-lede">The people who look after {me.circle.elderName} together.</p>
        </div>
      </header>

      <Card className="hx-invite" aria-labelledby="invite-title">
        <h2 id="invite-title" className="hx-section-title">
          Invite someone
        </h2>
        <p>
          Share the code <strong className="hx-code hx-code--inline">{me.circle.code}</strong>. Send the passcode in a separate message.
        </p>
        <Button icon="copy" onClick={() => void copy()}>
          {copied ? "Code copied" : "Copy code"}
        </Button>
      </Card>

      <MembersCard />
      <PreferencesCard />
      {me.member.role === "elder" && <PasscodeCard />}
      <ActivityCard />
      <EmailsCard />
    </div>
  );
}
