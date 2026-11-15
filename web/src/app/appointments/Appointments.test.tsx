import "../test-utils";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Appointment } from "../../api/types";
import { renderApp } from "../test-utils";
import { Appointments } from "./Appointments";

vi.mock("../../api/client", () => ({
  listAppointments: vi.fn(),
  createAppointment: vi.fn(),
  updateAppointment: vi.fn(),
  deleteAppointment: vi.fn(),
  appointmentIcsUrl: (id: string) => `/api/v1/appointments/${id}/ics`,
}));

import * as api from "../../api/client";

const apt: Appointment = {
  id: "apt_1",
  doctorName: "Dr. Rao",
  specialty: "Cardiology",
  location: "Pune",
  startsAt: "2026-11-20T05:00:00.000Z",
  durationMinutes: 30,
  notes: "",
  reminderMinutesBefore: 1440,
  createdBy: "m_1",
  updatedAt: "2026-11-01T00:00:00.000Z",
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listAppointments).mockResolvedValue([apt]);
});

describe("Appointments", () => {
  it("lists appointments with calendar links", async () => {
    renderApp(<Appointments />);
    expect(await screen.findByRole("heading", { level: 2, name: "Dr. Rao" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /calendar \(download file\)/i })).toHaveAttribute("href", "/api/v1/appointments/apt_1/ics");
    const google = screen.getByRole("link", { name: /Google Calendar/ });
    expect(google.getAttribute("href")).toContain("https://calendar.google.com/calendar/render?action=TEMPLATE");
    expect(google).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("converts the local date and time in the circle zone to ISO UTC on save", async () => {
    vi.mocked(api.createAppointment).mockResolvedValue(apt);
    const user = userEvent.setup();
    renderApp(<Appointments />);

    await user.click(await screen.findByRole("button", { name: "Add an appointment" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.type(dialog.getByLabelText(/who is it with/i), "Dr. Menon");
    fireEvent.change(dialog.getByLabelText("Date"), { target: { value: "2026-11-20" } });
    fireEvent.change(dialog.getByLabelText("Time"), { target: { value: "10:30" } });
    await user.click(dialog.getByRole("button", { name: "Add appointment" }));

    await waitFor(() => expect(api.createAppointment).toHaveBeenCalled());
    // 10:30 in Asia/Kolkata (UTC+5:30) is 05:00 UTC.
    expect(api.createAppointment).toHaveBeenCalledWith({
      doctorName: "Dr. Menon",
      specialty: "",
      location: "",
      startsAt: "2026-11-20T05:00:00.000Z",
      durationMinutes: 30,
      notes: "",
      reminderMinutesBefore: 1440,
    });
  });

  it("requires a doctor name", async () => {
    const user = userEvent.setup();
    renderApp(<Appointments />);
    await user.click(await screen.findByRole("button", { name: "Add an appointment" }));
    const dialog = within(await screen.findByRole("dialog"));
    await user.click(dialog.getByRole("button", { name: "Add appointment" }));
    expect(await dialog.findByText(/who the appointment is with/i)).toBeInTheDocument();
    expect(api.createAppointment).not.toHaveBeenCalled();
  });
});
