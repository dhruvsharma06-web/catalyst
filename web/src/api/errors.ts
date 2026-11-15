import type { ApiErrorCode, ApiErrorDetail } from "./types";

/** Normalised failure for every API call, following the contract error shape. */
export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details: ApiErrorDetail[];

  constructor(code: ApiErrorCode, message: string, status = 0, details: ApiErrorDetail[] = []) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export const isAbortError = (e: unknown): boolean =>
  e instanceof DOMException && e.name === "AbortError";

/** Plain-language message suitable for showing to a person. */
export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.code === "NETWORK") return "We can't reach Hearth. Check your connection and try again.";
    if (e.code === "TIMEOUT") return "That took too long. Please try again.";
    if (e.code === "INTERNAL") return "Something went wrong on our side. Please try again.";
    return e.message;
  }
  return "Something went wrong. Please try again.";
}

/** Server field details as a { field: reason } map for inline display. */
export function fieldErrors(e: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (e instanceof ApiError) for (const d of e.details) out[d.field] = d.reason;
  return out;
}
