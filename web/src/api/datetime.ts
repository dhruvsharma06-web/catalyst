/** Pure time-zone helpers. All wall-clock values are in the circle's IANA time zone. */

const pad = (n: number): string => String(n).padStart(2, "0");

const formatterCache = new Map<string, Intl.DateTimeFormat>();

function partsFormatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatterCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    formatterCache.set(timeZone, f);
  }
  return f;
}

export interface ZonedParts {
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  weekday: number; // 0 = Sunday
}

/** Wall-clock parts of an instant in a time zone. */
export function zonedParts(instant: Date | string | number, timeZone: string): ZonedParts {
  const ms = instant instanceof Date ? instant.getTime() : new Date(instant).getTime();
  const get: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(ms)) {
    if (p.type !== "literal") get[p.type] = Number(p.value);
  }
  const y = get["year"] ?? 1970;
  const mo = get["month"] ?? 1;
  const d = get["day"] ?? 1;
  return {
    date: `${y}-${pad(mo)}-${pad(d)}`,
    time: `${pad(get["hour"] ?? 0)}:${pad(get["minute"] ?? 0)}`,
    weekday: new Date(Date.UTC(y, mo - 1, d)).getUTCDay(),
  };
}

/** Offset (zone minus UTC) in milliseconds at the given instant. */
function offsetMs(utcMs: number, timeZone: string): number {
  const get: Record<string, number> = {};
  for (const p of partsFormatter(timeZone).formatToParts(utcMs)) {
    if (p.type !== "literal") get[p.type] = Number(p.value);
  }
  const asUtc = Date.UTC(
    get["year"] ?? 1970,
    (get["month"] ?? 1) - 1,
    get["day"] ?? 1,
    get["hour"] ?? 0,
    get["minute"] ?? 0,
    get["second"] ?? 0,
  );
  return asUtc - Math.floor(utcMs / 1000) * 1000;
}

/** Converts a local date + time in `timeZone` to an ISO UTC string (DST-safe). */
export function zonedLocalToUtcIso(date: string, time: string, timeZone: string): string {
  const [y, mo, d] = date.split("-").map(Number);
  const [h, mi] = time.split(":").map(Number);
  const wall = Date.UTC(y ?? 1970, (mo ?? 1) - 1, d ?? 1, h ?? 0, mi ?? 0);
  // Two passes settle the offset when the guess lands on the far side of a DST change.
  let utc = wall - offsetMs(wall, timeZone);
  utc = wall - offsetMs(utc, timeZone);
  return new Date(utc).toISOString();
}

export function todayInZone(timeZone: string, now: Date = new Date()): string {
  return zonedParts(now, timeZone).date;
}

/** Adds whole days to a YYYY-MM-DD date. */
export function addDays(date: string, days: number): string {
  const [y, m, d] = date.split("-").map(Number);
  const t = new Date(Date.UTC(y ?? 1970, (m ?? 1) - 1, (d ?? 1) + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Legacy IANA aliases some browsers still report, mapped to their current names. */
const ZONE_ALIASES: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Asia/Rangoon": "Asia/Yangon",
  "Europe/Kiev": "Europe/Kyiv",
};

export const detectTimeZone = (): string => {
  try {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    return ZONE_ALIASES[zone] ?? zone;
  } catch {
    return "UTC";
  }
};
