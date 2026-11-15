import { getActivity, getNotifications } from "../../api/client";
import { useAsync } from "../../api/hooks";
import type { Notification } from "../../api/types";
import { Badge, Card, EmptyState, ErrorState, Skeleton } from "../ui";
import { ROLE_LABEL, formatDateTime, relativeTime } from "../util/format";
import { useSession } from "../session";

const KIND_LABEL: Record<Notification["kind"], string> = {
  dose_upcoming: "Dose reminder",
  dose_missed: "Missed dose",
  appointment_upcoming: "Appointment reminder",
  refill_low: "Refill reminder",
};

export function ActivityCard() {
  const activity = useAsync((s) => getActivity(30, s), []);
  return (
    <Card className="hx-block" aria-labelledby="activity-title">
      <h2 id="activity-title" className="hx-section-title">
        Recent activity
      </h2>
      {activity.loading && !activity.data && <Skeleton lines={4} label="Loading activity" />}
      {Boolean(activity.error) && !activity.data && <ErrorState error={activity.error} onRetry={activity.reload} title="We couldn't load recent activity" />}
      {activity.data && activity.data.length === 0 && (
        <EmptyState icon="clock" title="Nothing yet">
          When someone adds a medicine or marks a dose, it will show up here.
        </EmptyState>
      )}
      {activity.data && activity.data.length > 0 && (
        <ul className="hx-rows">
          {activity.data.map((a) => (
            <li key={a.id} className="hx-row">
              <div className="hx-row__main">
                <p className="hx-row__title">{a.summary}</p>
                <p className="hx-muted">
                  {a.actorName} ({ROLE_LABEL[a.actorRole]}) ·{" "}
                  <time dateTime={a.at}>{relativeTime(a.at)}</time>
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

export function EmailsCard() {
  const { me } = useSession();
  const mails = useAsync((s) => getNotifications(20, s), []);
  return (
    <Card className="hx-block" aria-labelledby="emails-title">
      <h2 id="emails-title" className="hx-section-title">
        Emails sent
      </h2>
      {mails.loading && !mails.data && <Skeleton lines={3} label="Loading emails" />}
      {Boolean(mails.error) && !mails.data && <ErrorState error={mails.error} onRetry={mails.reload} title="We couldn't load the emails" />}
      {mails.data && mails.data.length === 0 && (
        <EmptyState icon="mail" title="No emails yet">
          Reminders about doses and appointments will be listed here once they are sent.
        </EmptyState>
      )}
      {mails.data && mails.data.length > 0 && (
        <>
          <ul className="hx-rows">
            {mails.data.map((n) => (
              <li key={n.id} className="hx-row">
                <div className="hx-row__main">
                  <p className="hx-row__title">{n.subject}</p>
                  <p className="hx-muted">
                    {KIND_LABEL[n.kind]} · to {n.toMasked} · <time dateTime={n.at}>{formatDateTime(n.at, me.circle.timezone)}</time>
                  </p>
                </div>
                <Badge tone={n.transport === "smtp" ? "success" : "neutral"} icon="mail">
                  {n.transport === "smtp" ? "Email" : "Logged"}
                </Badge>
              </li>
            ))}
          </ul>
          <p className="hx-field__hint">"Logged" means the reminder was recorded but not emailed because email sending isn't switched on.</p>
        </>
      )}
    </Card>
  );
}
