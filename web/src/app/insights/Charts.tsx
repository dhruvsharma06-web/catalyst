import { motion, useReducedMotion } from "motion/react";
import { useId } from "react";
import type { AdherenceDay } from "../../api/types";
import { percent } from "../util/format";

/** Glowing half-dial with the overall rate as a big number. */
export function Gauge({ rate }: { rate: number | null }) {
  const reduce = useReducedMotion();
  const gradient = `hx-gauge-${useId().replace(/:/g, "")}`;
  const r = 80;
  const arc = Math.PI * r;
  const value = rate ?? 0;
  return (
    <figure className="hx-gauge" aria-label={`Medicines taken: ${percent(rate)}`}>
      <svg viewBox="0 0 200 116" width="240" role="presentation" aria-hidden="true">
        <defs>
          <linearGradient id={gradient} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" style={{ stopColor: "var(--aurora-teal)" }} />
            <stop offset="0.6" style={{ stopColor: "var(--aurora-amber)" }} />
            <stop offset="1" style={{ stopColor: "var(--aurora-ember)" }} />
          </linearGradient>
        </defs>
        <path className="hx-gauge__track" d="M20 100 A80 80 0 0 1 180 100" fill="none" strokeWidth="16" strokeLinecap="round" />
        <motion.path
          className="hx-gauge__bar"
          d="M20 100 A80 80 0 0 1 180 100"
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
          stroke={`url(#${gradient})`}
          strokeDasharray={arc}
          initial={{ strokeDashoffset: arc }}
          animate={{ strokeDashoffset: arc * (1 - value), opacity: value > 0 ? 1 : 0 }}
          transition={reduce ? { duration: 0 } : { type: "spring", duration: 1, bounce: 0.1 }}
        />
      </svg>
      <figcaption className="hx-gauge__value">{percent(rate)}</figcaption>
    </figure>
  );
}

const shortDay = (date: string, days: number): string => {
  const d = new Date(`${date}T12:00:00Z`);
  return days <= 14
    ? d.toLocaleDateString(undefined, { weekday: "narrow", timeZone: "UTC" })
    : String(d.getUTCDate());
};

const longDay = (date: string): string =>
  new Date(`${date}T12:00:00Z`).toLocaleDateString(undefined, { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" });

/** Stacked daily bars. Fills differ by pattern as well as colour; a data table follows for screen readers. */
export function DayChart({ byDay }: { byDay: AdherenceDay[] }) {
  const slot = 28;
  const height = 120;
  const width = Math.max(1, byDay.length) * slot;
  const max = Math.max(1, ...byDay.map((d) => d.scheduled));
  const unit = (height - 8) / max;

  return (
    <div className="hx-chart">
      <svg viewBox={`0 0 ${width} ${height + 22}`} role="img" aria-labelledby="chart-title chart-desc" className="hx-chart__svg">
        <title id="chart-title">Medicines each day</title>
        <desc id="chart-desc">Bars show how many doses were taken, skipped or missed on each day. The same numbers are in the table below.</desc>
        <defs>
          <pattern id="hx-hatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="6" height="6" fill="var(--danger-bg)" />
            <rect width="2.5" height="6" fill="var(--danger)" />
          </pattern>
          <pattern id="hx-dots" width="5" height="5" patternUnits="userSpaceOnUse">
            <rect width="5" height="5" fill="var(--warning-bg)" />
            <circle cx="2.5" cy="2.5" r="1.1" fill="var(--warning)" />
          </pattern>
        </defs>
        {byDay.map((d, i) => {
          const x = i * slot + 5;
          const w = slot - 10;
          const hTaken = d.taken * unit;
          const hSkipped = d.skipped * unit;
          const hMissed = d.missed * unit;
          const baseline = height;
          const label = `${longDay(d.date)}: ${d.taken} taken, ${d.skipped} skipped, ${d.missed} missed`;
          return (
            <g key={d.date}>
              <title>{label}</title>
              <rect x={x} y={4} width={w} height={height - 4} rx="4" className="hx-chart__slot" />
              <rect x={x} y={baseline - hTaken} width={w} height={hTaken} className="hx-chart__taken" />
              <rect x={x} y={baseline - hTaken - hSkipped} width={w} height={hSkipped} fill="url(#hx-dots)" />
              <rect x={x} y={baseline - hTaken - hSkipped - hMissed} width={w} height={hMissed} fill="url(#hx-hatch)" />
              {(byDay.length <= 14 || i % 5 === 0 || i === byDay.length - 1) && (
                <text x={x + w / 2} y={height + 15} textAnchor="middle" className="hx-chart__label">
                  {shortDay(d.date, byDay.length)}
                </text>
              )}
            </g>
          );
        })}
      </svg>
      <ul className="hx-legend" aria-hidden="true">
        <li><span className="hx-legend__key hx-legend__key--taken" /> Taken</li>
        <li><span className="hx-legend__key hx-legend__key--skipped" /> Skipped</li>
        <li><span className="hx-legend__key hx-legend__key--missed" /> Missed</li>
      </ul>
      <table className="visually-hidden">
        <caption>Doses per day</caption>
        <thead>
          <tr><th scope="col">Day</th><th scope="col">Planned</th><th scope="col">Taken</th><th scope="col">Skipped</th><th scope="col">Missed</th></tr>
        </thead>
        <tbody>
          {byDay.map((d) => (
            <tr key={d.date}>
              <th scope="row">{longDay(d.date)}</th>
              <td>{d.scheduled}</td><td>{d.taken}</td><td>{d.skipped}</td><td>{d.missed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
