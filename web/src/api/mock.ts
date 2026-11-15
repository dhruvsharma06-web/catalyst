/** In-memory backend used when VITE_USE_MOCK === "true". Mirrors the contract types exactly. */
import { addDays, todayInZone, zonedLocalToUtcIso, zonedParts } from "./datetime";
import { ApiError } from "./errors";
import type {
  Account,
  Activity,
  Adherence,
  Api,
  Appointment,
  Circle,
  Dose,
  DoseStatus,
  Medication,
  Member,
  Me,
  Notification,
  Role,
  User,
} from "./types";

const TZ = "Asia/Kolkata";
const MIN = 60_000;
const delay = (ms = 120): Promise<void> => new Promise((r) => setTimeout(r, ms));
let seq = 100;
const nextId = (p: string): string => `${p}_${(seq++).toString(36)}`;
const isoAgo = (minutes: number): string => new Date(Date.now() - minutes * MIN).toISOString();
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

let circle: Circle = { id: "c_1", code: "MAPLE-4821", elderName: "Kamala Iyer", timezone: TZ, createdAt: isoAgo(60 * 24 * 40) };
let members: Member[] = [
  { id: "m_1", name: "Kamala Iyer", role: "elder", email: "kamala@example.com", notify: { doses: true, missed: true, appointments: true }, joinedAt: circle.createdAt },
  { id: "m_2", name: "Meera Iyer", role: "caretaker", email: "meera@example.com", notify: { doses: false, missed: true, appointments: true }, joinedAt: isoAgo(60 * 24 * 38) },
  { id: "m_3", name: "Arjun Iyer", role: "family", email: null, notify: { doses: false, missed: true, appointments: false }, joinedAt: isoAgo(60 * 24 * 20) },
];
let signedIn = true;
let currentId = "m_1";
let passcode = "maple-1234";

const start = addDays(todayInZone(TZ), -30);
const med = (id: string, f: Partial<Medication> & Pick<Medication, "name" | "dosage" | "times" | "color" | "shape">): Medication => ({
  id,
  instructions: "",
  daysOfWeek: ALL_DAYS,
  startDate: start,
  endDate: null,
  stock: 30,
  refillAt: 7,
  active: true,
  createdBy: "m_2",
  updatedAt: isoAgo(60 * 24),
  ...f,
});

let medications: Medication[] = [
  med("med_1", { name: "Metformin", dosage: "500 mg", times: ["08:00", "20:00"], color: "white", shape: "round", instructions: "Take with food.", stock: 6, refillAt: 10 }),
  med("med_2", { name: "Amlodipine", dosage: "5 mg", times: ["09:00"], color: "pink", shape: "round", stock: 24 }),
  med("med_3", { name: "Atorvastatin", dosage: "10 mg", times: ["21:00"], color: "blue", shape: "oval", instructions: "Take after dinner." }),
  med("med_4", { name: "Vitamin D3", dosage: "1000 IU", times: ["13:00"], color: "yellow", shape: "capsule", daysOfWeek: [1, 4], stock: 40 }),
  med("med_5", { name: "Levothyroxine", dosage: "50 mcg", times: ["06:30"], color: "green", shape: "round", instructions: "Empty stomach, 30 minutes before breakfast.", stock: 18 }),
];

const logs = new Map<string, { status: "taken" | "skipped"; at: string; by: string }>();
const futureLocal = (days: number, time: string): string => zonedLocalToUtcIso(addDays(todayInZone(TZ), days), time, TZ);

let appointments: Appointment[] = [
  { id: "apt_1", doctorName: "Dr. Rao", specialty: "Cardiology", location: "Ruby Hall Clinic, Pune", startsAt: futureLocal(3, "10:30"), durationMinutes: 30, notes: "Bring recent BP readings.", reminderMinutesBefore: 1440, createdBy: "m_2", updatedAt: isoAgo(600) },
  { id: "apt_2", doctorName: "Dr. Menon", specialty: "Endocrinology", location: "Jehangir Hospital, Pune", startsAt: futureLocal(-12, "16:00"), durationMinutes: 45, notes: "", reminderMinutesBefore: 60, createdBy: "m_1", updatedAt: isoAgo(60 * 24 * 14) },
];

let activity: Activity[] = [
  { id: "act_1", at: isoAgo(35), actorName: "Kamala Iyer", actorRole: "elder", kind: "dose_taken", summary: "Marked Levothyroxine as taken" },
  { id: "act_2", at: isoAgo(60 * 20), actorName: "Meera Iyer", actorRole: "caretaker", kind: "appointment_created", summary: "Added an appointment with Dr. Rao" },
  { id: "act_3", at: isoAgo(60 * 48), actorName: "Arjun Iyer", actorRole: "family", kind: "member_joined", summary: "Joined the circle" },
];
const addActivity = (kind: string, summary: string): void => {
  const m = members.find((x) => x.id === currentId) ?? members[0];
  if (!m) return;
  activity = [{ id: nextId("act"), at: new Date().toISOString(), actorName: m.name, actorRole: m.role, kind, summary }, ...activity];
};

const notifications: Notification[] = [
  { id: "n_1", at: isoAgo(60 * 3), kind: "dose_missed", toMasked: "m***@example.com", subject: "Kamala missed Amlodipine 5 mg", transport: "smtp" },
  { id: "n_2", at: isoAgo(60 * 27), kind: "appointment_upcoming", toMasked: "k***@example.com", subject: "Appointment with Dr. Rao tomorrow at 10:30", transport: "log" },
  { id: "n_3", at: isoAgo(60 * 50), kind: "refill_low", toMasked: "m***@example.com", subject: "Metformin is running low (6 left)", transport: "smtp" },
];

const meOf = (id: string): Me => {
  const member = members.find((m) => m.id === id) ?? members[0];
  if (!member) throw new ApiError("NOT_FOUND", "Member not found", 404);
  return { member, circle };
};

const requireSession = (): void => {
  if (!signedIn) throw new ApiError("UNAUTHORIZED", "Please sign in", 401);
};
const find = <T extends { id: string }>(list: T[], id: string, what: string): T => {
  const item = list.find((x) => x.id === id);
  if (!item) throw new ApiError("NOT_FOUND", `${what} not found`, 404);
  return item;
};

function statusFor(scheduledAt: string, now: number): DoseStatus {
  const diff = now - new Date(scheduledAt).getTime();
  if (diff > 60 * MIN) return "missed";
  if (diff >= -15 * MIN) return "due";
  return "upcoming";
}

function dosesFor(date: string): Dose[] {
  const out: Dose[] = [];
  const weekday = zonedParts(zonedLocalToUtcIso(date, "12:00", TZ), TZ).weekday;
  for (const m of medications) {
    if (!m.active || !m.daysOfWeek.includes(weekday) || m.startDate > date || (m.endDate && m.endDate < date)) continue;
    for (const time of m.times) {
      const id = `${m.id}_${date}_${time.replace(":", "")}`;
      const scheduledAt = zonedLocalToUtcIso(date, time, TZ);
      const log = logs.get(id);
      out.push({
        id, medicationId: m.id, name: m.name, dosage: m.dosage, color: m.color, shape: m.shape, time, scheduledAt,
        status: log ? log.status : statusFor(scheduledAt, Date.now()),
        loggedAt: log?.at ?? null,
        loggedBy: log?.by ?? null,
      });
    }
  }
  return out.sort((a, b) => a.time.localeCompare(b.time));
}

function adherence(days: number): Adherence {
  const today = todayInZone(TZ);
  const byDay = [];
  const perMed = new Map<string, { name: string; taken: number; total: number }>();
  for (let i = days - 1; i >= 0; i--) {
    const date = addDays(today, -i);
    let taken = 0, skipped = 0, missed = 0, scheduled = 0;
    for (const d of dosesFor(date)) {
      if (d.status === "upcoming" || d.status === "due") continue;
      // Past days without logs are simulated: roughly one in eight doses was missed.
      const simulated: DoseStatus = !logs.has(d.id) && date < today ? (hash(d.id) % 8 === 0 ? "missed" : "taken") : d.status;
      scheduled++;
      if (simulated === "taken") taken++;
      else if (simulated === "skipped") skipped++;
      else missed++;
      const e = perMed.get(d.medicationId) ?? { name: d.name, taken: 0, total: 0 };
      e.total++;
      if (simulated === "taken") e.taken++;
      perMed.set(d.medicationId, e);
    }
    byDay.push({ date, scheduled, taken, skipped, missed });
  }
  const total = byDay.reduce((s, d) => s + d.scheduled, 0);
  const taken = byDay.reduce((s, d) => s + d.taken, 0);
  let streakDays = 0;
  for (let i = byDay.length - 1; i >= 0; i--) {
    const d = byDay[i];
    if (!d || d.missed > 0) break;
    if (d.scheduled > 0) streakDays++;
  }
  return {
    days,
    rate: total ? taken / total : null,
    streakDays,
    byDay,
    byMedication: [...perMed.entries()].map(([medicationId, v]) => ({ medicationId, name: v.name, rate: v.total ? v.taken / v.total : null })),
  };
}

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  return h;
}

let user: User = { id: "m_1", name: "Kamala Iyer", email: "kamala@example.com", createdAt: circle.createdAt };
let activeCircle = true;

const joinAs = (role: Role): string => {
  const existing = members.find((m) => m.id === user.id);
  if (existing) return existing.id;
  const m: Member = { id: user.id, name: user.name, role, email: user.email, notify: { doses: true, missed: true, appointments: true }, joinedAt: new Date().toISOString() };
  members = [...members, m];
  return m.id;
};

const account = (): Account => ({
  user,
  circles: members.some((m) => m.id === user.id) ? [{ circle, role: meOf(user.id).member.role }] : [],
  active: activeCircle && members.some((m) => m.id === user.id) ? meOf(user.id) : null,
});

export const mockApi: Api = {
  async signup(input) {
    await delay();
    user = { id: nextId("u"), name: input.name, email: input.email.toLowerCase(), createdAt: new Date().toISOString() };
    currentId = user.id;
    activeCircle = false;
    signedIn = true;
    return account();
  },
  async login(input) {
    await delay();
    if (input.email.toLowerCase() !== user.email) throw new ApiError("UNAUTHORIZED", "That email and password don't match. Please try again.", 401);
    signedIn = true;
    activeCircle = false;
    return account();
  },
  async getAccount() {
    await delay(60);
    requireSession();
    return account();
  },
  async logout() {
    await delay(60);
    signedIn = false;
  },
  async createCircle(input) {
    await delay();
    requireSession();
    circle = { id: nextId("c"), code: "MAPLE-4821", elderName: input.elderName, timezone: input.timezone, createdAt: new Date().toISOString() };
    members = [];
    medications = [];
    appointments = [];
    activity = [];
    passcode = input.passcode;
    currentId = joinAs(input.role);
    activeCircle = true;
    return meOf(currentId);
  },
  async joinCircle(input) {
    await delay();
    requireSession();
    if (input.code.trim().toUpperCase() !== circle.code || input.passcode !== passcode) {
      throw new ApiError("UNAUTHORIZED", "That circle code and passcode don't match. Please check both and try again.", 401);
    }
    currentId = joinAs(input.role);
    activeCircle = true;
    return meOf(currentId);
  },
  async openCircle(circleId) {
    await delay(60);
    requireSession();
    if (circleId !== circle.id) throw new ApiError("FORBIDDEN", "You are not a member of that circle.", 403);
    activeCircle = true;
    return meOf(currentId);
  },
  async getSession() {
    await delay(60);
    requireSession();
    if (!activeCircle) throw new ApiError("CONFLICT", "Choose a care circle first.", 409);
    return meOf(currentId);
  },
  async listMembers() {
    await delay();
    requireSession();
    return members;
  },
  async updateMe(input) {
    await delay();
    requireSession();
    const me = find(members, currentId, "Member");
    const updated: Member = { ...me, email: input.email !== undefined ? input.email : me.email, notify: input.notify ?? me.notify };
    members = members.map((m) => (m.id === me.id ? updated : m));
    return updated;
  },
  async removeMember(id) {
    await delay();
    requireSession();
    if (meOf(currentId).member.role !== "elder") throw new ApiError("FORBIDDEN", "Only the elder can remove members", 403);
    find(members, id, "Member");
    members = members.filter((m) => m.id !== id);
    addActivity("member_removed", "Removed a member");
  },
  async changePasscode(input) {
    await delay();
    requireSession();
    if (input.currentPasscode !== passcode) throw new ApiError("FORBIDDEN", "Current passcode is incorrect", 403, [{ field: "currentPasscode", reason: "Incorrect" }]);
    passcode = input.newPasscode;
  },
  async listMedications() {
    await delay();
    requireSession();
    return [...medications].sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  },
  async createMedication(input) {
    await delay();
    requireSession();
    const m: Medication = { ...input, id: nextId("med"), active: true, createdBy: currentId, updatedAt: new Date().toISOString() };
    medications = [...medications, m];
    addActivity("medication_created", `Added ${m.name} ${m.dosage}`);
    return m;
  },
  async updateMedication(id, patch) {
    await delay();
    requireSession();
    const updated: Medication = { ...find(medications, id, "Medication"), ...patch, updatedAt: new Date().toISOString() };
    medications = medications.map((m) => (m.id === id ? updated : m));
    addActivity("medication_updated", `Updated ${updated.name}`);
    return updated;
  },
  async deleteMedication(id) {
    await delay();
    requireSession();
    const m = find(medications, id, "Medication");
    medications = medications.filter((x) => x.id !== id);
    addActivity("medication_deleted", `Removed ${m.name}`);
  },
  async getDoses(date) {
    await delay();
    requireSession();
    const d = date ?? todayInZone(circle.timezone);
    return { date: d, doses: dosesFor(d) };
  },
  async logDose(id, status) {
    await delay(80);
    requireSession();
    const dose = dosesFor(todayInZone(circle.timezone)).find((d) => d.id === id);
    if (!dose) throw new ApiError("NOT_FOUND", "Dose not found", 404);
    const at = new Date().toISOString();
    logs.set(id, { status, at, by: currentId });
    if (status === "taken") {
      medications = medications.map((m) => (m.id === dose.medicationId && m.stock !== null ? { ...m, stock: Math.max(0, m.stock - 1) } : m));
    }
    addActivity(status === "taken" ? "dose_taken" : "dose_skipped", `Marked ${dose.name} as ${status}`);
    return { ...dose, status, loggedAt: at, loggedBy: currentId };
  },
  async getAdherence(days) {
    await delay();
    requireSession();
    return adherence(days);
  },
  async listAppointments(scope) {
    await delay();
    requireSession();
    const now = Date.now();
    return appointments
      .filter((a) => {
        const past = new Date(a.startsAt).getTime() + a.durationMinutes * MIN < now;
        return scope === "all" || (scope === "past" ? past : !past);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  },
  async createAppointment(input) {
    await delay();
    requireSession();
    const a: Appointment = { ...input, id: nextId("apt"), createdBy: currentId, updatedAt: new Date().toISOString() };
    appointments = [...appointments, a];
    addActivity("appointment_created", `Added an appointment with ${a.doctorName}`);
    return a;
  },
  async updateAppointment(id, patch) {
    await delay();
    requireSession();
    const updated: Appointment = { ...find(appointments, id, "Appointment"), ...patch, updatedAt: new Date().toISOString() };
    appointments = appointments.map((a) => (a.id === id ? updated : a));
    addActivity("appointment_updated", `Updated the appointment with ${updated.doctorName}`);
    return updated;
  },
  async deleteAppointment(id) {
    await delay();
    requireSession();
    const a = find(appointments, id, "Appointment");
    appointments = appointments.filter((x) => x.id !== id);
    addActivity("appointment_deleted", `Removed the appointment with ${a.doctorName}`);
  },
  async getActivity(limit = 30) {
    await delay();
    requireSession();
    return activity.slice(0, limit);
  },
  async getNotifications(limit = 20) {
    await delay();
    requireSession();
    return notifications.slice(0, limit);
  },
  async scanPrescription() {
    await delay(900);
    requireSession();
    return {
      medications: [
        { name: "Telmisartan", dosage: "40 mg", instructions: "Once daily after breakfast", times: ["09:00"], daysOfWeek: ALL_DAYS },
        { name: "Pantoprazole", dosage: "40 mg", instructions: "Before breakfast", times: ["07:30"], daysOfWeek: ALL_DAYS },
      ],
      confidence: 0.82,
      notes: "Sample result. The second line was partly cut off, so please check the dosage.",
      model_version: "mock",
    };
  },
  async getCareSummary() {
    await delay(700);
    requireSession();
    return {
      summary: "Kamala took most of her medicines on time this week. A couple of evening doses were missed, and one refill is coming up.",
      highlights: ["Morning medicines taken on time six days out of seven", "Cardiology visit with Dr. Rao is booked for this week"],
      attention: ["Metformin has 6 tablets left", "Two evening doses were missed on weekdays"],
      model_version: "mock",
      generatedAt: new Date().toISOString(),
    };
  },
};

