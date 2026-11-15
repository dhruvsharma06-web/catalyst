import { ApiError } from "./errors";
import type { Api, ApiErrorBody, ApiErrorCode, ApiErrorDetail } from "./types";

export { ApiError } from "./errors";

const BASE = "/api/v1";
const TIMEOUT_MS = 20_000;
const USE_MOCK = import.meta.env.VITE_USE_MOCK === "true";

interface RequestOptions {
  body?: unknown;
  query?: Record<string, string | number | undefined>;
  signal?: AbortSignal;
}

const SERVER_CODES: ReadonlySet<string> = new Set([
  "INVALID_INPUT",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "CONFLICT",
  "PAYLOAD_TOO_LARGE",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL",
]);

function toQuery(query: RequestOptions["query"]): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(query)) if (v !== undefined) params.set(k, String(v));
  const s = params.toString();
  return s ? `?${s}` : "";
}

function isErrorBody(v: unknown): v is ApiErrorBody {
  if (typeof v !== "object" || v === null || !("error" in v)) return false;
  const e = (v as { error: unknown }).error;
  return typeof e === "object" && e !== null && typeof (e as { message?: unknown }).message === "string";
}

function toApiError(status: number, parsed: unknown): ApiError {
  if (isErrorBody(parsed)) {
    const { code, message, details } = parsed.error;
    const known: ApiErrorCode = SERVER_CODES.has(code) ? (code as ApiErrorCode) : "INTERNAL";
    const safe: ApiErrorDetail[] = Array.isArray(details) ? details : [];
    return new ApiError(known, message, status, safe);
  }
  return new ApiError("INTERNAL", `Unexpected response (${status})`, status);
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  if (opts.signal?.aborted) throw new DOMException("Request aborted", "AbortError");
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, TIMEOUT_MS);
  const external = opts.signal;
  const forwardAbort = (): void => controller.abort();
  if (external) {
    if (external.aborted) controller.abort();
    else external.addEventListener("abort", forwardAbort, { once: true });
  }

  const headers: Record<string, string> = { "X-Requested-With": "hearth", Accept: "application/json" };
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";

  try {
    let res: Response;
    try {
      res = await fetch(`${BASE}${path}${toQuery(opts.query)}`, {
        method,
        credentials: "same-origin",
        headers,
        body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
        signal: controller.signal,
      });
    } catch (e) {
      if (timedOut) throw new ApiError("TIMEOUT", "The request timed out");
      if (external?.aborted) throw e; // caller cancelled: let AbortError propagate
      throw new ApiError("NETWORK", "Network request failed");
    }

    if (res.status === 204) return undefined as T;
    const text = await res.text();
    let parsed: unknown;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = undefined;
    }
    if (!res.ok) throw toApiError(res.status, parsed);
    return parsed as T;
  } finally {
    clearTimeout(timer);
    external?.removeEventListener("abort", forwardAbort);
  }
}

const enc = encodeURIComponent;

const httpApi: Api = {
  signup: (input, signal) => request("POST", "/auth/signup", { body: input, signal }),
  login: (input, signal) => request("POST", "/auth/login", { body: input, signal }),
  getAccount: (signal) => request("GET", "/auth/me", { signal }),
  logout: (signal) => request("POST", "/auth/logout", { signal }),
  createCircle: (input, signal) => request("POST", "/circles", { body: input, signal }),
  joinCircle: (input, signal) => request("POST", "/circles/join", { body: input, signal }),
  openCircle: (circleId, signal) => request("POST", "/circles/active", { body: { circleId }, signal }),
  getSession: (signal) => request("GET", "/session", { signal }),
  listMembers: async (signal) => (await request<{ members: Awaited<ReturnType<Api["listMembers"]>> }>("GET", "/members", { signal })).members,
  updateMe: (input, signal) => request("PATCH", "/members/me", { body: input, signal }),
  removeMember: (id, signal) => request("DELETE", `/members/${enc(id)}`, { signal }),
  changePasscode: (input, signal) => request("POST", "/circles/passcode", { body: input, signal }),
  listMedications: async (signal) =>
    (await request<{ medications: Awaited<ReturnType<Api["listMedications"]>> }>("GET", "/medications", { signal })).medications,
  createMedication: (input, signal) => request("POST", "/medications", { body: input, signal }),
  updateMedication: (id, patch, signal) => request("PATCH", `/medications/${enc(id)}`, { body: patch, signal }),
  deleteMedication: (id, signal) => request("DELETE", `/medications/${enc(id)}`, { signal }),
  getDoses: (date, signal) => request("GET", "/doses", { query: { date }, signal }),
  logDose: (id, status, signal) => request("POST", `/doses/${enc(id)}/log`, { body: { status }, signal }),
  getAdherence: (days, signal) => request("GET", "/adherence", { query: { days }, signal }),
  listAppointments: async (scope, signal) =>
    (await request<{ appointments: Awaited<ReturnType<Api["listAppointments"]>> }>("GET", "/appointments", { query: { scope }, signal })).appointments,
  createAppointment: (input, signal) => request("POST", "/appointments", { body: input, signal }),
  updateAppointment: (id, patch, signal) => request("PATCH", `/appointments/${enc(id)}`, { body: patch, signal }),
  deleteAppointment: (id, signal) => request("DELETE", `/appointments/${enc(id)}`, { signal }),
  getActivity: async (limit = 30, signal) =>
    (await request<{ activity: Awaited<ReturnType<Api["getActivity"]>> }>("GET", "/activity", { query: { limit }, signal })).activity,
  getNotifications: async (limit = 20, signal) =>
    (await request<{ notifications: Awaited<ReturnType<Api["getNotifications"]>> }>("GET", "/notifications", { query: { limit }, signal })).notifications,
  scanPrescription: (input, signal) => request("POST", "/ai/prescription-scan", { body: input, signal }),
  getCareSummary: (signal) => request("GET", "/ai/care-summary", { signal }),
};

/** The mock backend is loaded lazily so it never ships in a production bundle. */
async function backend(): Promise<Api> {
  if (USE_MOCK) return (await import("./mock")).mockApi;
  return httpApi;
}

export const signup: Api["signup"] = async (...a) => (await backend()).signup(...a);
export const login: Api["login"] = async (...a) => (await backend()).login(...a);
export const getAccount: Api["getAccount"] = async (...a) => (await backend()).getAccount(...a);
export const logout: Api["logout"] = async (...a) => (await backend()).logout(...a);
export const createCircle: Api["createCircle"] = async (...a) => (await backend()).createCircle(...a);
export const joinCircle: Api["joinCircle"] = async (...a) => (await backend()).joinCircle(...a);
export const openCircle: Api["openCircle"] = async (...a) => (await backend()).openCircle(...a);
export const getSession: Api["getSession"] = async (...a) => (await backend()).getSession(...a);
export const listMembers: Api["listMembers"] = async (...a) => (await backend()).listMembers(...a);
export const updateMe: Api["updateMe"] = async (...a) => (await backend()).updateMe(...a);
export const removeMember: Api["removeMember"] = async (...a) => (await backend()).removeMember(...a);
export const changePasscode: Api["changePasscode"] = async (...a) => (await backend()).changePasscode(...a);
export const listMedications: Api["listMedications"] = async (...a) => (await backend()).listMedications(...a);
export const createMedication: Api["createMedication"] = async (...a) => (await backend()).createMedication(...a);
export const updateMedication: Api["updateMedication"] = async (...a) => (await backend()).updateMedication(...a);
export const deleteMedication: Api["deleteMedication"] = async (...a) => (await backend()).deleteMedication(...a);
export const getDoses: Api["getDoses"] = async (...a) => (await backend()).getDoses(...a);
export const logDose: Api["logDose"] = async (...a) => (await backend()).logDose(...a);
export const getAdherence: Api["getAdherence"] = async (...a) => (await backend()).getAdherence(...a);
export const listAppointments: Api["listAppointments"] = async (...a) => (await backend()).listAppointments(...a);
export const createAppointment: Api["createAppointment"] = async (...a) => (await backend()).createAppointment(...a);
export const updateAppointment: Api["updateAppointment"] = async (...a) => (await backend()).updateAppointment(...a);
export const deleteAppointment: Api["deleteAppointment"] = async (...a) => (await backend()).deleteAppointment(...a);
export const getActivity: Api["getActivity"] = async (...a) => (await backend()).getActivity(...a);
export const getNotifications: Api["getNotifications"] = async (...a) => (await backend()).getNotifications(...a);
export const scanPrescription: Api["scanPrescription"] = async (...a) => (await backend()).scanPrescription(...a);
export const getCareSummary: Api["getCareSummary"] = async (...a) => (await backend()).getCareSummary(...a);

/** Download URL for an appointment's calendar file. */
export const appointmentIcsUrl = (id: string): string => `${BASE}/appointments/${enc(id)}/ics`;
