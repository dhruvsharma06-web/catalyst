/** Wire types for the Hearth API (see CONTRACT.md v1.0). */

export type Role = "elder" | "caretaker" | "family";

export interface Circle {
  id: string;
  code: string;
  elderName: string;
  timezone: string;
  createdAt: string;
}

export interface NotifyPrefs {
  doses: boolean;
  missed: boolean;
  appointments: boolean;
}

export interface Member {
  id: string;
  name: string;
  role: Role;
  email: string | null;
  notify: NotifyPrefs;
  joinedAt: string;
}

export interface Me {
  member: Member;
  circle: Circle;
}

export interface User {
  id: string;
  name: string;
  email: string;
  createdAt: string;
}

/** The signed-in person: profile, every circle they belong to, and the active one (if any). */
export interface Account {
  user: User;
  circles: Array<{ circle: Circle; role: Role }>;
  active: Me | null;
}

export type PillColor = "white" | "blue" | "pink" | "yellow" | "green" | "orange";
export type PillShape = "round" | "oval" | "capsule";

export interface Medication {
  id: string;
  name: string;
  dosage: string;
  instructions: string;
  /** "HH:mm" in the circle timezone, 1-8 entries, unique, sorted. */
  times: string[];
  /** 0 = Sunday .. 6 = Saturday; all seven = daily. */
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

export interface Notification {
  id: string;
  at: string;
  kind: "dose_upcoming" | "dose_missed" | "appointment_upcoming" | "refill_low";
  toMasked: string;
  subject: string;
  transport: "smtp" | "log";
}

export interface AdherenceDay {
  date: string;
  scheduled: number;
  taken: number;
  skipped: number;
  missed: number;
}

export interface AdherenceMedication {
  medicationId: string;
  name: string;
  rate: number | null;
}

export interface Adherence {
  days: number;
  rate: number | null;
  streakDays: number;
  byDay: AdherenceDay[];
  byMedication: AdherenceMedication[];
}

export interface DosesResponse {
  date: string;
  doses: Dose[];
}

export interface ScanDraft {
  name: string;
  dosage: string;
  instructions: string;
  times: string[];
  daysOfWeek: number[];
}

export interface ScanResult {
  medications: ScanDraft[];
  confidence: number;
  notes: string;
  model_version: string;
}

export interface CareSummary {
  summary: string;
  highlights: string[];
  attention: string[];
  model_version: string;
  generatedAt: string;
}

/** Client-only codes (NETWORK, TIMEOUT) extend the contract's server codes. */
export type ApiErrorCode =
  | "INVALID_INPUT"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "CONFLICT"
  | "PAYLOAD_TOO_LARGE"
  | "RATE_LIMITED"
  | "UPSTREAM_UNAVAILABLE"
  | "INTERNAL"
  | "NETWORK"
  | "TIMEOUT";

export interface ApiErrorDetail {
  field: string;
  reason: string;
}

export interface ApiErrorBody {
  error: { code: string; message: string; details?: ApiErrorDetail[] };
}

/* ---- Request inputs ---- */

export interface SignupInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateCircleInput {
  elderName: string;
  timezone: string;
  passcode: string;
  role: Role;
}

export interface JoinCircleInput {
  code: string;
  passcode: string;
  role: Role;
}

export interface UpdateMeInput {
  email?: string | null;
  notify?: NotifyPrefs;
}

export interface ChangePasscodeInput {
  currentPasscode: string;
  newPasscode: string;
}

export type MedicationInput = Omit<Medication, "id" | "createdBy" | "updatedAt" | "active">;
export type MedicationPatch = Partial<MedicationInput> & { active?: boolean };

export type DoseLogStatus = "taken" | "skipped";
export type AppointmentScope = "upcoming" | "past" | "all";
export type AppointmentInput = Omit<Appointment, "id" | "createdBy" | "updatedAt">;
export type AppointmentPatch = Partial<AppointmentInput>;

export interface ScanRequest {
  imageBase64: string;
  mimeType: "image/jpeg" | "image/png" | "image/webp";
}

/** Every endpoint, unwrapped from its response envelope. */
export interface Api {
  signup(input: SignupInput, signal?: AbortSignal): Promise<Account>;
  login(input: LoginInput, signal?: AbortSignal): Promise<Account>;
  getAccount(signal?: AbortSignal): Promise<Account>;
  logout(signal?: AbortSignal): Promise<void>;
  createCircle(input: CreateCircleInput, signal?: AbortSignal): Promise<Me>;
  joinCircle(input: JoinCircleInput, signal?: AbortSignal): Promise<Me>;
  openCircle(circleId: string, signal?: AbortSignal): Promise<Me>;
  getSession(signal?: AbortSignal): Promise<Me>;
  listMembers(signal?: AbortSignal): Promise<Member[]>;
  updateMe(input: UpdateMeInput, signal?: AbortSignal): Promise<Member>;
  removeMember(id: string, signal?: AbortSignal): Promise<void>;
  changePasscode(input: ChangePasscodeInput, signal?: AbortSignal): Promise<void>;
  listMedications(signal?: AbortSignal): Promise<Medication[]>;
  createMedication(input: MedicationInput, signal?: AbortSignal): Promise<Medication>;
  updateMedication(id: string, patch: MedicationPatch, signal?: AbortSignal): Promise<Medication>;
  deleteMedication(id: string, signal?: AbortSignal): Promise<void>;
  getDoses(date?: string, signal?: AbortSignal): Promise<DosesResponse>;
  logDose(id: string, status: DoseLogStatus, signal?: AbortSignal): Promise<Dose>;
  getAdherence(days: number, signal?: AbortSignal): Promise<Adherence>;
  listAppointments(scope: AppointmentScope, signal?: AbortSignal): Promise<Appointment[]>;
  createAppointment(input: AppointmentInput, signal?: AbortSignal): Promise<Appointment>;
  updateAppointment(id: string, patch: AppointmentPatch, signal?: AbortSignal): Promise<Appointment>;
  deleteAppointment(id: string, signal?: AbortSignal): Promise<void>;
  getActivity(limit?: number, signal?: AbortSignal): Promise<Activity[]>;
  getNotifications(limit?: number, signal?: AbortSignal): Promise<Notification[]>;
  scanPrescription(input: ScanRequest, signal?: AbortSignal): Promise<ScanResult>;
  getCareSummary(signal?: AbortSignal): Promise<CareSummary>;
}
