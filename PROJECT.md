# Hearth — PROJECT.md (updated 2026-11-15)

## Brief
User: an elderly person living independently (e.g. "Kamala, 78, five daily medicines, lives alone in Pune") and the family/caretakers around her.
Pain: missed doses and appointments go unnoticed until something goes wrong; families coordinate over scattered WhatsApp messages; most "care apps" treat the elder as a patient to be monitored, not the owner of their care.
Value: one shared, passcode-protected care circle where the elder stays in charge, everyone sees the same schedule, and email reminders ensure nothing slips.
Primary journey: 1. Elder (or helper) creates a circle and shares code + passcode → 2. family joins, snaps a prescription photo, Gemini drafts the schedule, elder confirms → 3. elder taps "Taken" on a large-print Today view; family sees adherence + gets an email when a dose is missed.
Wow moment: photo of a prescription label → a reviewed, ready medication schedule in seconds, then the pill organizer on screen fills itself in.
Event/rules: PromptWars (Catalyst). Public GitHub repo + Cloud Run URL + description. Platform scoring: code quality, security, efficiency, testing, accessibility, problem alignment, effective use of Google services. Up to 2 scored submissions.

## Requirements
| ID | Exact wording (condensed) | MUST/SHOULD | Covered by |
|----|---------------------------|-------------|-----------|
| R1 | help elderly individuals manage daily medications, appointments, routines | MUST | F3, F4, F5 |
| R2 | keep family members and caretakers informed | MUST | F6, F7, F8 |
| R3 | shared ecosystem … through secure, passcode-based access | MUST | F1, F2 |
| R4 | view, add, edit, manage medication schedules | MUST | F3 |
| R5 | track adherence | MUST | F5 |
| R6 | monitor upcoming doctor appointments | MUST | F4 |
| R7 | proactively send email reminders for missed medications, upcoming doses, appointments | MUST | F7 |
| R8 | go beyond a basic reminder app — smarter, accessible, reliable, collaborative | SHOULD | F9, F10, F11 |
| R9 | elderly individuals remain at the centre of their own healthcare decisions | MUST | F2, F9, F12 |

## Features
| ID | Feature | P | Acceptance check |
|----|---------|---|------------------|
| F1 | Create / join circle with code + passcode (scrypt hashed, rate limited) | P0 | wrong passcode → 401; right → dashboard |
| F2 | Roles elder/caretaker/family; elder can revoke members & change passcode | P0 | family DELETE member → 403 |
| F3 | Medication CRUD with times, days, stock | P0 | new med appears in Today doses |
| F4 | Appointments CRUD + .ics export | P0 | .ics opens in Google Calendar |
| F5 | Today doses (taken/skip) + 7-day adherence | P0 | taking a dose moves the rate |
| F6 | Activity feed (who changed what) | P0 | every write appears |
| F7 | Email reminders via Cloud Scheduler job (upcoming, missed, appointment, refill) | P0 | job call → notification rows + SMTP/log |
| F8 | Notifications log in UI | P1 | sent emails listed |
| F9 | Gemini prescription scan → reviewed draft | P0 | photo → editable drafts, nothing saved until confirmed |
| F10 | Gemini weekly care summary for family | P1 | summary with highlights |
| F11 | Elder mode: extra-large type, high contrast, read-aloud (Web Speech) | P0 | toggle persists; WCAG AA |
| F12 | Landing page (skeuomorphic, motion) | P0 | Lighthouse ≥ 90 perf/a11y |

## Architecture
One Cloud Run service: Express 5 (TypeScript) serves `/api/v1` and the built Vite React app.
`web/ (React) → /api/v1 (routes → services → repositories → adapters)`; adapters: Firestore (or in-memory), Gemini (`@google/genai`, or mock), Mailer (SMTP via nodemailer, or log).
Google services: Cloud Run, Firestore, Gemini API, Cloud Scheduler, Secret Manager, Cloud Build, Google Calendar (.ics).

## Status
Works for real: every P0 and P1 feature, verified end to end in a browser (desktop + 375 px). Still mocked locally: AI (local client) and email (log transport) until Gemini/SMTP credentials are set. Known limits: adherence history recomputed from current schedules.

## Decisions and assumptions
A1: Contract-first parallel development: frontend, backend and tests built against CONTRACT.md and fixtures. A2: Single repository, single deployable. A3: Region asia-south1, timezone default Asia/Kolkata. A4: No API keys in hand yet → every adapter has a mock behind a flag. A5: Email via SMTP (Gmail app password) — log transport when unset.
D1: Single service on Cloud Run (simplest to deploy and score). D2: Passcode access per spec instead of OAuth accounts.

## Cut list (in order)
1. F10 care summary 2. F8 notifications UI 3. refill-low emails 4. landing VFX layer (keep static skeuomorphic hero)
