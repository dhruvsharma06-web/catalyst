import { motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router";
import { getDoses, listAppointments, logDose } from "../../api/client";
import { errorMessage } from "../../api/errors";
import { useAsync } from "../../api/hooks";
import type { Dose, DoseLogStatus, DosesResponse } from "../../api/types";
import { useSession } from "../session";
import { Button, Card, EmptyState, ErrorState, SkeletonCards, useToast, Icon } from "../ui";
import { PARTS_OF_DAY, formatDateTime, formatLongDate, greetingFor, partOfDay } from "../util/format";
import { zonedParts } from "../../api/datetime";
import { DOSE_LIST, DoseRow } from "./DoseRow";
import { GettingStarted } from "./GettingStarted";
import { ProgressRing } from "./ProgressRing";
import { buildReadAloud, canSpeak } from "./readAloud";

const REFRESH_MS = 5 * 60_000;

export function Today() {
  const { me } = useSession();
  const toast = useToast();
  const reduce = useReducedMotion();
  const doses = useAsync((s) => getDoses(undefined, s), []);
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const pendingRef = useRef(new Set<string>());
  const [speaking, setSpeaking] = useState(false);

  // Keep due/missed states fresh without a manual refresh.
  const { reload } = doses;
  useEffect(() => {
    const t = setInterval(reload, REFRESH_MS);
    return () => clearInterval(t);
  }, [reload]);

  useEffect(
    () => () => {
      if (canSpeak()) window.speechSynthesis.cancel();
    },
    [],
  );

  const list: Dose[] = useMemo(() => doses.data?.doses ?? [], [doses.data]);
  const replace = (next: Dose): void =>
    doses.setData((prev): DosesResponse | undefined => (prev ? { ...prev, doses: prev.doses.map((d) => (d.id === next.id ? next : d)) } : prev));

  const onLog = (dose: Dose, status: DoseLogStatus): void => {
    if (pendingRef.current.has(dose.id)) return;
    pendingRef.current.add(dose.id);
    setPending(new Set(pendingRef.current));
    replace({ ...dose, status, loggedAt: new Date().toISOString(), loggedBy: me.member.id });
    requestAnimationFrame(() => document.getElementById(`dose-${dose.id}`)?.focus());

    logDose(dose.id, status)
      .then((saved) => {
        replace(saved);
        toast.notify(`${dose.name} marked as ${status}`);
      })
      .catch((e: unknown) => {
        replace(dose); // roll back
        toast.fail(`We couldn't save that for ${dose.name}. ${errorMessage(e)}`);
      })
      .finally(() => {
        pendingRef.current.delete(dose.id);
        setPending(new Set(pendingRef.current));
      });
  };

  const toggleSpeech = (): void => {
    if (!canSpeak()) return;
    if (speaking) {
      window.speechSynthesis.cancel();
      setSpeaking(false);
      return;
    }
    const u = new SpeechSynthesisUtterance(buildReadAloud(list));
    u.onend = () => setSpeaking(false);
    u.onerror = () => setSpeaking(false);
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
    setSpeaking(true);
  };

  const now = new Date().toISOString();
  const tz = me.circle.timezone;
  const isElder = me.member.role === "elder";
  const first = me.member.name.split(" ")[0] ?? me.member.name;
  const done = list.filter((d) => d.status === "taken" || d.status === "skipped").length;
  const taken = list.filter((d) => d.status === "taken").length;

  return (
    <div className="hx-screen">
      <header className="hx-today__head">
        <div>
          <p className="hx-eyebrow">{formatLongDate(now, tz)}</p>
          <h1>{isElder ? `${greetingFor(zonedParts(now, tz).time)}, ${first}` : `${me.circle.elderName}'s day`}</h1>
          <p className="hx-lede">
            {list.length === 0 ? "Nothing scheduled yet." : `${taken} of ${list.length} medicines taken today.`}
          </p>
          {canSpeak() && list.length > 0 && (
            <Button icon={speaking ? "stop" : "speaker"} onClick={toggleSpeech} aria-pressed={speaking}>
              {speaking ? "Stop reading" : "Read aloud"}
            </Button>
          )}
        </div>
        {list.length > 0 && <ProgressRing done={done} total={list.length} />}
      </header>

      <GettingStarted />

      {doses.loading && !doses.data && <SkeletonCards count={3} />}
      {Boolean(doses.error) && !doses.data && <ErrorState error={doses.error} onRetry={doses.reload} title="We couldn't load today's medicines" />}
      {doses.data && list.length === 0 && (
        <EmptyState
          icon="pill"
          title="No medicines today"
          action={
            <Link className="hx-btn hx-btn--primary hx-btn--lg" to="/app/medicines">
              Add a medicine
            </Link>
          }
        >
          Add a medicine and its times, and it will show up here with big Taken and Skip buttons.
        </EmptyState>
      )}

      {doses.data && list.length > 0 && (
        <div className="hx-organizer">
          {PARTS_OF_DAY.map((part) => {
            const group = list.filter((d) => partOfDay(d.time) === part);
            if (group.length === 0) return null;
            return (
              <section key={part} className="hx-organizer__group" aria-labelledby={`part-${part}`}>
                <h2 id={`part-${part}`} className="hx-organizer__title">
                  {part}
                </h2>
                <motion.ul className="hx-organizer__list" variants={DOSE_LIST} initial={reduce ? false : "hidden"} animate="show">
                  {group.map((d) => (
                    <DoseRow key={d.id} dose={d} busy={pending.has(d.id)} onLog={onLog} />
                  ))}
                </motion.ul>
              </section>
            );
          })}
        </div>
      )}

      <NextAppointment />
    </div>
  );
}

function NextAppointment() {
  const { me } = useSession();
  const apts = useAsync((s) => listAppointments("upcoming", s), []);
  const next = apts.data?.[0];
  if (apts.loading && !apts.data) return null;
  if (apts.error) return <ErrorState error={apts.error} onRetry={apts.reload} title="We couldn't load your next appointment" />;
  return (
    <Card className="hx-next" aria-labelledby="next-apt">
      <h2 id="next-apt" className="hx-section-title">
        Next appointment
      </h2>
      {next ? (
        <>
          <p className="hx-next__who">
            <Icon name="calendar" /> {next.doctorName}
            {next.specialty && <span className="hx-muted"> · {next.specialty}</span>}
          </p>
          <p>{formatDateTime(next.startsAt, me.circle.timezone)}</p>
          {next.location && <p className="hx-muted">{next.location}</p>}
          <Link to="/app/appointments">See all appointments</Link>
        </>
      ) : (
        <p>
          No appointments coming up. <Link to="/app/appointments">Add one</Link>
        </p>
      )}
    </Card>
  );
}

