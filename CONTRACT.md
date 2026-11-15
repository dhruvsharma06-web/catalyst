# CONTRACT v2.0 (changed only via a reviewed change request)

## Conventions
- Base URL: same origin, prefix `/api/v1`. Format JSON UTF-8. Times ISO 8601 (UTC, `Z`). Dates `YYYY-MM-DD` in the circle's timezone. Clock times `HH:mm` (24h) in the circle's timezone.
- IDs: opaque strings (server-generated, URL-safe). Unknown request fields are rejected (`INVALID_INPUT`). Max body 6 MB (prescription images), 100 KB elsewhere.
- Authentication: personal accounts (email + password). The session is an httpOnly + Secure + SameSite=Lax cookie `hearth_session` (signed JWT, 12 h) carrying the user and, once chosen, the active circle.
- Authorization: circle endpoints require a signed-in user who is a **member** of the active circle; data is always scoped to that circle. Management actions additionally require the elder role (or a caretaker while no elder has joined).
- Public endpoints: `POST /auth/signup`, `POST /auth/login`, `GET /health`, `GET /ready`; the job endpoint uses its own token.
- State-changing requests must send header `X-Requested-With: hearth` (CSRF guard). Missing → 403 `FORBIDDEN`.

## Error shape (every endpoint)
```json
{"error":{"code":"INVALID_INPUT","message":"Readable message","details":[{"field":"name","reason":"Required"}]}}
```
Codes: INVALID_INPUT 400 | UNAUTHORIZED 401 | FORBIDDEN 403 | NOT_FOUND 404 | CONFLICT 409 | PAYLOAD_TOO_LARGE 413 | RATE_LIMITED 429 | UPSTREAM_UNAVAILABLE 503 | INTERNAL 500

## Shared types
```ts
type Role = "elder" | "caretaker" | "family";
interface Circle { id: string; code: string; elderName: string; timezone: string; createdAt: string }
interface Member { id: string; name: string; role: Role; email: string | null; notify: { doses: boolean; missed: boolean; appointments: boolean }; joinedAt: string }
interface User { id: string; name: string; email: string; createdAt: string }
interface Me { member: Member; circle: Circle }                 // active circle context
interface Account { user: User; circles: Array<{ circle: Circle; role: Role }>; active: Me | null }
interface Medication {
  id: string; name: string; dosage: string; instructions: string;   // instructions may be ""
  times: string[];            // ["08:00","20:00"], 1-8 entries, unique, sorted
  daysOfWeek: number[];       // 0=Sun..6=Sat, 1-7 entries; [0..6] = daily
  startDate: string; endDate: string | null;
  stock: number | null; refillAt: number | null;   // pills left / warn threshold
  color: "white"|"blue"|"pink"|"yellow"|"green"|"orange"; shape: "round"|"oval"|"capsule";
  active: boolean; createdBy: string; updatedAt: string;
}
type DoseStatus = "taken" | "skipped" | "missed" | "due" | "upcoming";
interface Dose { id: string; medicationId: string; name: string; dosage: string; color: Medication["color"]; shape: Medication["shape"];
  time: string; scheduledAt: string; status: DoseStatus; loggedAt: string | null; loggedBy: string | null }
interface Appointment { id: string; doctorName: string; specialty: string; location: string; startsAt: string; durationMinutes: number;
  notes: string; reminderMinutesBefore: number; createdBy: string; updatedAt: string }
interface Activity { id: string; at: string; actorName: string; actorRole: Role; kind: string; summary: string }
interface Notification { id: string; at: string; kind: "dose_upcoming"|"dose_missed"|"appointment_upcoming"|"refill_low";
  toMasked: string; subject: string; transport: "smtp" | "log" }
```
Dose rules: `due` = within [scheduled-15 min, scheduled+60 min]; `missed` = > 60 min past with no log; `upcoming` = later. Dose id = `${medicationId}_${date}_${HHmm}`.

## Accounts (no circle needed)
- `POST /auth/signup` `{name 1-60, email, password 10-128}` → 201 `Account` + cookie. Email already registered → 409 `CONFLICT`.
- `POST /auth/login` `{email, password}` → 200 `Account` + cookie. Wrong email or password → 401 (one generic message). Limits: 10 / 15 min / IP and 10 failures / hour / account → 429.
- `GET /auth/me` → 200 `Account` | 401. `POST /auth/logout` → 204 (clears the cookie).
- Passwords are hashed with scrypt; the session is invalidated when the password changes.

## Circles (signed in)
- `POST /circles` `{elderName 1-60, timezone IANA, passcode 6-64, role}` → 201 `Me` and the new circle becomes active. The creator becomes a member with `role`; name and email come from the account.
- `POST /circles/join` `{code, passcode, role}` → 200 `Me` (active). Already a member → returns that membership. Wrong code/passcode → 401 (generic). Limits: 10 / 15 min / IP; 20 wrong passcodes / hour / circle → 429. Joining as `elder` when the circle has a different elder → 403.
- `POST /circles/active` `{circleId}` → 200 `Me`; 403 if the user is not a member.
- `GET /session` → 200 `Me` (active circle) | 401 not signed in | 409 `CONFLICT` signed in without an active circle.
- `POST /circles/passcode` `{currentPasscode, newPasscode}` → 204. Elder only (caretaker while no elder). Changing the passcode stops new joins with the old one; existing members keep access.

## Members
- `GET /members` → `{members: Member[]}` (elder first)
- `PATCH /members/me` `{notify?, email?}` → `Member` (email for reminders defaults to the account email)
- `DELETE /members/:id` → 204. Elder only (caretaker while no elder). Removing a member revokes their access to the circle immediately. Nobody can remove themselves (409).

## Medications
- `GET /medications` → `{medications: Medication[]}` (active first, name asc)
- `POST /medications` body = Medication minus `id, createdBy, updatedAt, active` (active defaults true) → 201 `Medication`
- `PATCH /medications/:id` partial body (same fields + `active`) → `Medication`
- `DELETE /medications/:id` → 204

## Doses & adherence
- `GET /doses?date=YYYY-MM-DD` (default today in circle tz) → `{date, doses: Dose[]}` sorted by time
- `POST /doses/:doseId/log` `{status:"taken"|"skipped"}` → `Dose`. Decrements stock when taken. Logging a dose > 36 h in the future → 400. Logging twice overwrites.
- `GET /adherence?days=7` (1-30) → `{days, rate: number 0-1 | null, streakDays, byDay:[{date, scheduled, taken, skipped, missed}], byMedication:[{medicationId, name, rate|null}]}` (only past/settled doses count)

## Appointments
- `GET /appointments?scope=upcoming|past|all` (default upcoming) → `{appointments: Appointment[]}` sorted by startsAt
- `POST /appointments` `{doctorName, specialty, location, startsAt, durationMinutes 5-480, notes, reminderMinutesBefore 0-10080}` → 201
- `PATCH /appointments/:id` partial → `Appointment`; `DELETE /appointments/:id` → 204
- `GET /appointments/:id/ics` → `text/calendar` file (Google Calendar / Apple Calendar import)

## Activity & notifications
- `GET /activity?limit=30` (1-100) → `{activity: Activity[]}` newest first. Every create/update/delete/log/join writes one entry.
- `GET /notifications?limit=20` → `{notifications: Notification[]}` newest first (lets the UI show "emails we sent").

## AI (Gemini, behind `ai/` adapter; `USE_MOCK_AI=true` returns fixtures labelled `model_version:"mock"`)
- `POST /ai/prescription-scan` `{imageBase64 (≤5 MB decoded), mimeType: image/jpeg|image/png|image/webp}` →
  `{medications: Array<{name, dosage, instructions, times: string[], daysOfWeek: number[]}>, confidence: number 0-1, notes: string, model_version: string}`.
  Never saved automatically — UI shows a review step and the user confirms each item. Not-a-prescription → `medications: []`, `notes` explains.
- `GET /ai/care-summary` → `{summary: string, highlights: string[], attention: string[], model_version: string, generatedAt: string}` — plain-language week summary for family, built from adherence + appointments. Never gives medical advice.
- Errors: `UPSTREAM_UNAVAILABLE` (provider down / timeout 20 s), `RATE_LIMITED` (20 AI calls / hour / circle).

## Jobs (Cloud Scheduler → Cloud Run)
- `POST /jobs/reminders` header `X-Job-Token: <JOB_TOKEN>` (constant-time compare) → `{circles, sent, skipped}`.
  Sends (deduplicated per dose/appointment/kind): dose upcoming (≤15 min), dose missed (>60 min, once), appointment upcoming (≤ reminderMinutesBefore), refill low. Recipients = members with email and the matching `notify` flag.

## Health
- `GET /health` → `{status:"ok", version}`

## Fixtures
`fixtures/*.json` — `me.ok`, `medications.ok|empty`, `doses.ok|empty`, `adherence.ok`, `appointments.ok|empty`, `activity.ok`, `notifications.ok`, `scan.ok|empty`, `summary.ok`, `error.unauthorized`, `error.invalid`.

## Changelog
v1.0 2026-11-15 initial
v1.1 2026-11-15 member-management rule when no elder; /ready
v2.0 2026-11-15 personal accounts (signup/login) required before creating or joining a circle; membership bound to the account
