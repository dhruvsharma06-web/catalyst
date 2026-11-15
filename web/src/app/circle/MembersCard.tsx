import { useState } from "react";
import { listMembers, removeMember } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { useAction, useAsync } from "../../api/hooks";
import type { Member } from "../../api/types";
import { useSession } from "../session";
import { Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Skeleton, useToast } from "../ui";
import { ROLE_LABEL } from "../util/format";

export function MembersCard() {
  const { me } = useSession();
  const toast = useToast();
  const members = useAsync((s) => listMembers(s), []);
  const [target, setTarget] = useState<Member | null>(null);
  const remove = useAction(async (m: Member) => {
    await removeMember(m.id);
    setTarget(null);
    toast.notify(`${m.name} was removed from the circle`);
    members.reload();
  });
  const isElder = me.member.role === "elder";

  return (
    <Card className="hx-block" aria-labelledby="members-title">
      <h2 id="members-title" className="hx-section-title">
        Members
      </h2>
      {members.loading && !members.data && <Skeleton lines={3} label="Loading members" />}
      {Boolean(members.error) && !members.data && <ErrorState error={members.error} onRetry={members.reload} title="We couldn't load the members" />}
      {members.data && members.data.length === 0 && (
        <EmptyState icon="people" title="No members yet">
          Share the circle code above to invite family.
        </EmptyState>
      )}
      {members.data && members.data.length > 0 && (
        <ul className="hx-rows">
          {members.data.map((m) => (
            <li key={m.id} className="hx-row">
              <span className="hx-avatar" aria-hidden="true">
                {m.name.slice(0, 1).toUpperCase()}
              </span>
              <div className="hx-row__main">
                <p className="hx-row__title">
                  {m.name}
                  {m.id === me.member.id && <span className="hx-muted"> (you)</span>}
                </p>
                <Badge tone={m.role === "elder" ? "accent" : "neutral"}>{ROLE_LABEL[m.role]}</Badge>
              </div>
              {isElder && m.id !== me.member.id && (
                <Button variant="ghost" icon="trash" aria-label={`Remove ${m.name} from the circle`} onClick={() => setTarget(m)}>
                  Remove
                </Button>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        title={`Remove ${target?.name ?? "this person"}?`}
        message="They won't be able to see the circle any more unless they join again with the code and passcode."
        confirmLabel="Yes, remove"
        pending={remove.pending}
        error={remove.error ? errorMessage(remove.error) : undefined}
        onCancel={() => {
          remove.clearError();
          setTarget(null);
        }}
        onConfirm={() => target && void remove.run(target)}
      />
    </Card>
  );
}
