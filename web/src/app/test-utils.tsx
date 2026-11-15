/* Test helpers: browser API guards for jsdom, sample data and a provider wrapper. */
import { cleanup, render } from "@testing-library/react";
import { afterEach } from "vitest";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router";
import type { Dose, Me, Medication, Member, Role } from "../api/types";
import { SessionContext } from "./session";
import { ToastProvider } from "./ui";

// Globals are off in vitest, so unmount between tests ourselves.
afterEach(cleanup);

if (typeof window !== "undefined") {
  if (!window.matchMedia) {
    window.matchMedia = (query: string): MediaQueryList =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList;
  }
  if (!("IntersectionObserver" in window)) {
    class StubObserver {
      observe(): void {}
      unobserve(): void {}
      disconnect(): void {}
      takeRecords(): IntersectionObserverEntry[] {
        return [];
      }
    }
    Object.assign(window, { IntersectionObserver: StubObserver });
  }
}

export const sampleMember = (role: Role = "elder"): Member => ({
  id: "m_1",
  name: "Kamala Iyer",
  role,
  email: "kamala@example.com",
  notify: { doses: true, missed: true, appointments: true },
  joinedAt: "2026-10-01T00:00:00.000Z",
});

export const sampleMe = (role: Role = "elder"): Me => ({
  member: sampleMember(role),
  circle: { id: "c_1", code: "MAPLE-4821", elderName: "Kamala Iyer", timezone: "Asia/Kolkata", createdAt: "2026-10-01T00:00:00.000Z" },
});

export const sampleDose = (over: Partial<Dose> = {}): Dose => ({
  id: "med_1_2026-11-15_0800",
  medicationId: "med_1",
  name: "Metformin",
  dosage: "500 mg",
  color: "white",
  shape: "round",
  time: "08:00",
  scheduledAt: "2026-11-15T02:30:00.000Z",
  status: "due",
  loggedAt: null,
  loggedBy: null,
  ...over,
});

export const sampleMedication = (over: Partial<Medication> = {}): Medication => ({
  id: "med_1",
  name: "Metformin",
  dosage: "500 mg",
  instructions: "",
  times: ["08:00"],
  daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
  startDate: "2026-11-01",
  endDate: null,
  stock: 20,
  refillAt: 5,
  color: "white",
  shape: "round",
  active: true,
  createdBy: "m_1",
  updatedAt: "2026-11-01T00:00:00.000Z",
  ...over,
});

export function renderApp(ui: ReactElement, opts: { route?: string; role?: Role } = {}) {
  const me = sampleMe(opts.role);
  return render(
    <MemoryRouter initialEntries={[opts.route ?? "/app/today"]}>
      <ToastProvider>
        <SessionContext.Provider
          value={{
            user: { id: me.member.id, name: me.member.name, email: me.member.email ?? "meera@example.com", createdAt: me.circle.createdAt },
            me,
            setMember: () => undefined,
            switchCircle: () => undefined,
            signOut: async () => undefined,
          }}
        >
          {ui}
        </SessionContext.Provider>
      </ToastProvider>
    </MemoryRouter>,
  );
}
