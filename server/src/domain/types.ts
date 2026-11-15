/** Domain types — mirror CONTRACT.md v1.0 exactly. */
export const ROLES = ["elder", "caretaker", "family"] as const;
export type Role = (typeof ROLES)[number];

export const PILL_COLORS = ["white", "blue", "pink", "yellow", "green", "orange"] as const;
export const PILL_SHAPES = ["round", "oval", "capsule"] as const;
export type PillColor = (typeof PILL_COLORS)[number];
export type PillShape = (typeof PILL_SHAPES)[number];

export interface Circle {
  id: string;
  code: string;
  elderName: string;
  timezone: string;
  createdAt: string;
}

/** Stored circle: never serialised to clients. */
export interface CircleRecord extends Circle {
  passcodeHash: string;
}

/** A person's account. One account can belong to several circles. */
export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** Stored account: never serialised to clients. */
export interface UserRecord extends User {
  passwordHash: string;
  /** Bumped when the password changes, invalidating every older session. */
  sessionVersion: number;
}

/** Index entry: which circles a user belongs to (kept in sync with members). */
export interface Membership {
  id: string; // circle id
  role: Role;
  joinedAt: string;
}

export interface NotifyPrefs {
  doses: boolean;
  missed: boolean;
  appointments: boolean;
}

/** A user's membership of one circle. `id` is the user's id. */
export interface Member {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  notify: NotifyPrefs;
  joinedAt: string;
}

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
  daysOfWeek: number[];
  startDate: string;
  endDate: string | null;
  stock: number | null;
  refillAt: number | null;
  color: PillColor;
  shape: PillShape;
  active: boolean;
  createdBy: string;
  updatedAt: string;
}

export type DoseStatus = "taken" | "skipped" | "missed" | "due" | "upcoming";

export interface Dose {
  id: string;
  medicationId: string;
  name: string;
  dosage: string;
  color: PillColor;
  shape: PillShape;
  time: string;
  scheduledAt: string;
  status: DoseStatus;
  loggedAt: string | null;
  loggedBy: string | null;
}

/** A recorded taken/skipped action. Keyed by dose id. */
export interface DoseLog {
  id: string;
  medicationId: string;
  date: string;
  time: string;
  status: "taken" | "skipped";
  loggedAt: string;
  loggedBy: string;
}

export interface Appointment {
  id: string;
  doctorName: string;
  specialty: string;
  location: string;
  startsAt: string;
  durationMinutes: number;
  notes: string;
  reminderMinutesBefore: number;
  createdBy: string;
  updatedAt: string;
}

export interface Activity {
  id: string;
  at: string;
  actorName: string;
  actorRole: Role;
  kind: string;
  summary: string;
}

export type NotificationKind = "dose_upcoming" | "dose_missed" | "appointment_upcoming" | "refill_low";

export interface Notification {
  id: string;
  at: string;
  kind: NotificationKind;
  toMasked: string;
  subject: string;
  transport: "smtp" | "log";
}

export interface Actor {
  memberId: string;
  name: string;
  role: Role;
  circleId: string;
}
