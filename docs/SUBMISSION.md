# Submission text

## Short description (≤ 80 words)

Hearth is a shared care circle for older adults. The elder, family and caretakers sign in with their own accounts and join with a circle code and passcode and keep one medication schedule and appointment calendar together. Doses are marked with one large button. Cloud Scheduler sends email reminders for upcoming doses, missed doses and visits. Gemini turns a prescription photo into a draft schedule that a person confirms. Built on Cloud Run, Firestore, Gemini and Cloud Scheduler.

## Full description (≤ 250 words)

Missed doses usually come to light too late, and families coordinate care over scattered messages. Hearth gives everyone around an older adult one shared, passcode-protected care circle, while keeping the elder in charge: only the elder can remove members or change the passcode, and every change is attributed in an activity log.

The Today view groups doses by time of day, with large Taken and Skip buttons, a large-text elder mode and read-aloud. Medicines support several daily times, chosen days, end dates and stock counts with refill warnings. Appointments can be added to Google Calendar in one tap.

Every five minutes Cloud Scheduler triggers a reminder sweep that emails members about upcoming doses, missed doses, appointments and low stock. Each email goes out exactly once per person, even across retries. To go beyond a reminder app, Gemini reads a photographed prescription into a structured draft schedule that a person reviews before anything is saved, and writes a plain-language weekly care summary for the family, with an honest rules-based fallback.

Engineering: a typed contract-first API (Express 5, TypeScript, zod) and a React 19 app; Firestore with circle-scoped queries; personal accounts with membership-based authorization; scrypt-hashed passwords and passcodes with per-IP, per-account and per-circle lockouts; httpOnly sessions; CSRF protection; a strict CSP; and secrets in Secret Manager. More than 400 automated tests cover domain rules, security, AI fallbacks and the reminder job. CI runs type checks, tests, build, secret scanning and a dependency audit.

## 3-minute demo script

| Time | Beat | What to show |
|---|---|---|
| 0:00–0:20 | Hook | "Kamala is 78 and takes five medicines a day. Her daughter lives in another city. When a dose is missed, nobody knows until something goes wrong." |
| 0:20–0:40 | Solution | Landing page: "Hearth is one shared care circle. Kamala stays in charge, and her family hears straight away when something slips." |
| 0:40–1:00 | Sign up and invite | Create an account, start a circle, then show the circle code and the advice to send the passcode separately. |
| 1:00–1:30 | **Wow moment** | Medicines, then Scan a prescription: photograph a label, review the drafted medicines, tick them and add. They appear on Today. |
| 1:30–1:50 | Elder view | Turn on large text, press Read aloud, tap Taken. The progress ring moves and the action is announced. |
| 1:50–2:10 | Family loop | Circle, Emails sent: show the missed-dose and upcoming-dose emails. Then Progress, Write this week's summary. |
| 2:10–2:35 | How it works | Architecture: Cloud Run, Firestore, Gemini with schema validation and a human in the loop, Cloud Scheduler with exactly-once reminders, Secret Manager. More than 400 tests in CI. |
| 2:35–2:50 | Impact and next | Fewer silent misses, less family worry. Next: SMS and WhatsApp, regional languages, offline PWA. |
| 2:50–3:00 | Close | "Hearth: care that stays close." Show the repo and live link. |

**Before the demo:** open the live URL in a clean window, zoom to 125%, keep a sample prescription photo ready, and pre-create a circle with a few medicines so Today is not empty.
