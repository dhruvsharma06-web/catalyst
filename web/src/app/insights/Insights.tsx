import { motion, useReducedMotion } from "motion/react";
import { useState } from "react";
import { Link } from "react-router";
import { getAdherence, getCareSummary } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { useAction, useAsync } from "../../api/hooks";
import type { CareSummary } from "../../api/types";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Segmented, Skeleton } from "../ui";
import { formatDateTime, percent } from "../util/format";
import { useSession } from "../session";
import { DayChart, Gauge } from "./Charts";

const RANGES = [
  { value: 7, label: "7 days" },
  { value: 14, label: "14 days" },
  { value: 30, label: "30 days" },
] as const;

export function Insights() {
  const { me } = useSession();
  const reduce = useReducedMotion();
  const [days, setDays] = useState<number>(7);
  const stats = useAsync((s) => getAdherence(days, s), [days]);
  const data = stats.data;
  const hasData = data !== undefined && data.byDay.some((d) => d.scheduled > 0);

  return (
    <div className="hx-screen">
      <header className="hx-pagehead">
        <div>
          <h1>Progress</h1>
          <p className="hx-lede">How {me.circle.elderName}'s medicines are going.</p>
        </div>
      </header>

      <Segmented label="Time range" value={days} options={RANGES} onChange={setDays} />

      {stats.loading && !data && <Skeleton lines={5} label="Loading progress" />}
      {Boolean(stats.error) && !data && <ErrorState error={stats.error} onRetry={stats.reload} title="We couldn't load progress" />}

      {data && !hasData && (
        <EmptyState
          icon="chart"
          title="Nothing to show yet"
          action={
            <Link className="hx-btn hx-btn--secondary" to="/app/today">
              Go to Today
            </Link>
          }
        >
          Once medicines have been taken (or missed), you'll see how the last {days} days went.
        </EmptyState>
      )}

      {data && hasData && (
        <>
          <Card className="hx-block hx-overview" aria-labelledby="overall-title">
            <div>
              <h2 id="overall-title" className="hx-section-title">
                Medicines taken, last {days} days
              </h2>
              <Gauge rate={data.rate} />
            </div>
            <p className="hx-streak">
              <span className="hx-streak__num">{data.streakDays}</span>
              <span>{data.streakDays === 1 ? "day in a row" : "days in a row"} with no missed medicines</span>
            </p>
          </Card>

          <Card className="hx-block" aria-labelledby="daily-title">
            <h2 id="daily-title" className="hx-section-title">
              Day by day
            </h2>
            <DayChart byDay={data.byDay} />
          </Card>

          <Card className="hx-block" aria-labelledby="bymed-title">
            <h2 id="bymed-title" className="hx-section-title">
              By medicine
            </h2>
            <ul className="hx-rows">
              {data.byMedication.map((m) => (
                <li key={m.medicationId} className="hx-row">
                  <div className="hx-row__main">
                    <p className="hx-row__title">{m.name}</p>
                    <div className="hx-meter" role="meter" aria-label={`${m.name} taken`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={m.rate === null ? undefined : Math.round(m.rate * 100)} aria-valuetext={percent(m.rate)}>
                      <motion.span initial={{ width: 0 }} animate={{ width: `${Math.round((m.rate ?? 0) * 100)}%` }} transition={reduce ? { duration: 0 } : { type: "spring", duration: 0.8, bounce: 0.05 }} />
                    </div>
                  </div>
                  <p className="hx-row__value">{percent(m.rate)}</p>
                </li>
              ))}
            </ul>
          </Card>
        </>
      )}

      <WeeklySummary />
    </div>
  );
}

function WeeklySummary() {
  const { me } = useSession();
  const [summary, setSummary] = useState<CareSummary>();
  const generate = useAction(async () => setSummary(await getCareSummary()));

  return (
    <Card className="hx-block" aria-labelledby="summary-title">
      <h2 id="summary-title" className="hx-section-title">
        Weekly care summary
      </h2>
      <p className="hx-muted">A short, plain-language note for the family about how the week went.</p>
      <Button icon="sparkle" loading={generate.pending} onClick={() => void generate.run()}>
        {generate.pending ? "Writing…" : summary ? "Write it again" : "Write this week's summary"}
      </Button>
      <div aria-live="polite">
        {Boolean(generate.error) && (
          <div className="hx-error" role="alert">
            <p className="hx-error__text">{errorMessage(generate.error)}</p>
          </div>
        )}
        {summary && (
          <div className="hx-summary">
            <p>{summary.summary}</p>
            {summary.highlights.length > 0 && (
              <>
                <h3>Good to know</h3>
                <ul className="hx-bullets">
                  {summary.highlights.map((h) => (
                    <li key={h}><Icon name="check" size={16} /> {h}</li>
                  ))}
                </ul>
              </>
            )}
            {summary.attention.length > 0 && (
              <>
                <h3>Needs attention</h3>
                <ul className="hx-bullets hx-bullets--attention">
                  {summary.attention.map((h) => (
                    <li key={h}><Icon name="warning" size={16} /> {h}</li>
                  ))}
                </ul>
              </>
            )}
            <p className="hx-muted">
              <Badge>Model: {summary.model_version}</Badge> Written {formatDateTime(summary.generatedAt, me.circle.timezone)}.
            </p>
            <p className="hx-disclaimer">Not medical advice. This summary only describes what was recorded in Hearth. Talk to a doctor or pharmacist about any health concerns.</p>
          </div>
        )}
      </div>
    </Card>
  );
}
