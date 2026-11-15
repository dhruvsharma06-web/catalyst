import type { Role } from "../../api/types";

export const PASSCODE_MIN = 6;
export const PASSCODE_MAX = 64;
export const PASSWORD_MIN = 10;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type Errors = Record<string, string>;

export interface SignupValues {
  name: string;
  email: string;
  password: string;
}

export interface LoginValues {
  email: string;
  password: string;
}

export interface CreateValues {
  elderName: string;
  role: Role;
  timezone: string;
  passcode: string;
  confirm: string;
}

export interface JoinValues {
  code: string;
  passcode: string;
  role: Role;
}

function nameError(v: string, missing: string): string | undefined {
  if (!v.trim()) return missing;
  if (v.trim().length > 60) return "Use 60 characters or fewer.";
  return undefined;
}

function passcodeError(p: string): string | undefined {
  if (p.length < PASSCODE_MIN) return `Use at least ${PASSCODE_MIN} characters.`;
  if (p.length > PASSCODE_MAX) return `Use ${PASSCODE_MAX} characters or fewer.`;
  return undefined;
}

const collect = (entries: Array<[string, string | undefined]>): Errors =>
  Object.fromEntries(entries.filter((e): e is [string, string] => Boolean(e[1])));

export function validateSignup(v: SignupValues): Errors {
  return collect([
    ["name", nameError(v.name, "Please enter your name.")],
    ["email", EMAIL.test(v.email.trim()) ? undefined : "Enter a valid email address."],
    ["password", v.password.length < PASSWORD_MIN ? `Use at least ${PASSWORD_MIN} characters.` : undefined],
  ]);
}

export function validateLogin(v: LoginValues): Errors {
  return collect([
    ["email", EMAIL.test(v.email.trim()) ? undefined : "Enter a valid email address."],
    ["password", v.password ? undefined : "Enter your password."],
  ]);
}

export function validateCreate(v: CreateValues): Errors {
  return collect([
    ["elderName", nameError(v.elderName, "Who is this circle for?")],
    ["timezone", v.timezone ? undefined : "Please choose a time zone."],
    ["passcode", passcodeError(v.passcode)],
    ["confirm", v.confirm === v.passcode ? undefined : "The passcodes don't match."],
  ]);
}

export function validateJoin(v: JoinValues): Errors {
  return collect([
    ["code", v.code.trim() ? undefined : "Enter the circle code, for example MAPLE-4821."],
    ["passcode", v.passcode ? undefined : "Enter the circle passcode."],
  ]);
}

export function secretStrength(p: string, min: number): { label: string; level: "none" | "weak" | "ok" | "strong" } {
  if (!p) return { label: `At least ${min} characters.`, level: "none" };
  if (p.length < min) return { label: `${min - p.length} more to go.`, level: "weak" };
  const variety = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z0-9]/].filter((r) => r.test(p)).length;
  if (p.length >= min + 6 || variety >= 3) return { label: "Strong.", level: "strong" };
  return { label: "Good. Longer is stronger.", level: "ok" };
}
