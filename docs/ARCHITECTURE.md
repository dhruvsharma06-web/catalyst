# Hearth architecture

## Shape

One Cloud Run service serves both the API (`/api/v1`) and the built React app. A single deployable keeps operations simple. It also means one origin with no CORS surface, and cookies that never cross sites.

```
request → helmet / logging / rate limit → CSRF guard → session → route → service → domain + repository + adapters
```

| Layer | Responsibility | Rule |
|---|---|---|
| `http/routes` | Parse and validate input (zod), call one service, shape the response | No business logic |
| `services` | Business rules, permissions, activity logging | No HTTP or storage details |
| `domain` | Pure functions: dose expansion, status, adherence, iCalendar | No I/O; fully unit tested |
| `repo` | `Store` interface; Firestore and in-memory implementations | Every query is scoped by circle ID |
| `adapters` | Gemini / local AI, SMTP / log mailer | Selected by configuration at start-up |

Every dependency is injected through a `Deps` object (`server/src/services/deps.ts`): config, logger, store, AI client, mailer, session signer and clock. Tests build the app with an in-memory store, a capturing mailer and a controllable clock, so behaviour that depends on time is deterministic.

## Data model (Firestore)

```
circles/{circleId}                 code, elderName, timezone, passcodeHash, sessionVersion
  members/{memberId}               name, role, email, notify{doses,missed,appointments}
  medications/{medId}              name, dosage, times[], daysOfWeek[], start/end, stock, refillAt, active
  doseLogs/{doseId}                medicationId, date, time, status (taken|skipped), loggedBy
  appointments/{aptId}             doctorName, specialty, location, startsAt, durationMinutes, reminderMinutesBefore
  activity/{id}                    who did what, newest first
  notifications/{id}               kind, masked recipient, subject, transport
  reminderClaims/{hash(key)}       exactly-once guard for reminder emails
  counters/{hash(key)}             AI quota and failed-join counters per hour
```

Doses are not stored. They are expanded on demand from the schedule for a date in the circle's time zone and merged with any logs. The dose ID is `medicationId_YYYY-MM-DD_HHmm`, so a log is addressable without a lookup table.

## Dose status

| Status | Rule |
|---|---|
| `upcoming` | More than 15 minutes before the scheduled time |
| `due` | From 15 minutes before to 60 minutes after |
| `missed` | More than 60 minutes after, with no log |
| `taken` / `skipped` | Recorded by a member; marking taken decrements stock, and undoing it restores stock |

Adherence counts only settled doses (taken, skipped, missed), so a dose that is merely upcoming never lowers the rate. A day that is still in progress neither extends nor breaks the streak.

## Reminder sweep

Cloud Scheduler calls `POST /api/v1/jobs/reminders` every 5 minutes with `X-Job-Token`, which is compared in constant time. For each circle:

1. Expand yesterday's and today's doses. Load upcoming appointments and medicines.
2. Build events: an upcoming dose (within 15 minutes), a missed dose (missed within the last 12 hours), an appointment inside its reminder window, and low stock (once per day).
3. For each recipient whose email and preference match, **claim** `event-key:member-id` using Firestore `create()`, which fails if the document exists. Only the first claim sends.
4. If delivery fails, the claim is released so the next sweep retries for that person only.
5. A failure in one circle is logged and never stops the others.

The sweep is idempotent, so overlapping or repeated runs never send duplicate emails.

## AI design

- **Prescription scan.** Gemini receives the image with a system instruction that treats image text as data, and returns JSON constrained by a response schema. The server validates the result with zod, retries once on invalid output, and then returns a clean `UPSTREAM_UNAVAILABLE`. Results are drafts: the UI requires a person to tick each item before anything is saved.
- **Care summary.** Only aggregate facts are sent: first name, rates, missed-dose times and upcoming visits. If the model is unavailable, a deterministic rules-based summary is returned and labelled `rules-fallback`. It never presents a fabricated model answer.
- **Cost control.** Each circle has an hourly quota (`AI_HOURLY_LIMIT`), a 20 s timeout and capped output tokens.
- With no credentials, a local client returns clearly labelled sample output (`model_version: "mock"`), so the product is fully demoable offline.

## Key decisions

| Decision | Why |
|---|---|
| Shared circle passcode instead of individual accounts | The brief asks for passcode-based access, and older users should not have to manage another account. The trade-off is offset by lockouts, the elder's ability to rotate the passcode, and attributed activity. |
| Doses computed, not stored | One source of truth (the schedule). Editing a schedule needs no migration. |
| Single container | The simplest reliable Cloud Run deployment: one origin, one set of headers, one health check. |
| Contract-first (`CONTRACT.md` + `fixtures/`) | Frontend and backend were built in parallel against the same shapes. The fixtures double as test data. |
| Adapters with local implementations | Local development and CI need no secrets, and every external failure mode can be tested. |
