import "../test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sampleDose, sampleMedication, sampleMember, renderApp } from "../test-utils";
import { Today } from "./Today";

vi.mock("../../api/client", () => ({
  getDoses: vi.fn(),
  logDose: vi.fn(),
  listAppointments: vi.fn(),
  listMedications: vi.fn(),
  listMembers: vi.fn(),
}));

import * as api from "../../api/client";

const doses = [
  sampleDose(),
  sampleDose({ id: "med_2_2026-11-15_2000", medicationId: "med_2", name: "Atorvastatin", dosage: "10 mg", time: "20:00", status: "upcoming" }),
];

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.getDoses).mockResolvedValue({ date: "2026-11-15", doses });
  vi.mocked(api.listAppointments).mockResolvedValue([]);
  // Checklist is complete, so it stays out of the way.
  vi.mocked(api.listMedications).mockResolvedValue([sampleMedication()]);
  vi.mocked(api.listMembers).mockResolvedValue([sampleMember(), { ...sampleMember("family"), id: "m_2" }]);
});

describe("Today", () => {
  it("shows doses grouped by time of day with status text", async () => {
    renderApp(<Today />);
    expect(await screen.findByRole("heading", { level: 2, name: "Morning" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 2, name: "Evening" })).toBeInTheDocument();
    expect(screen.getByText("Metformin")).toBeInTheDocument();
    expect(screen.getByText("Due now")).toBeInTheDocument();
    expect(screen.getByText("Later")).toBeInTheDocument();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
  });

  it("logs a dose as taken and announces it in the live region", async () => {
    vi.mocked(api.logDose).mockResolvedValue({ ...doses[0]!, status: "taken", loggedAt: "2026-11-15T02:40:00.000Z", loggedBy: "m_1" });
    const user = userEvent.setup();
    renderApp(<Today />);

    await user.click(await screen.findByRole("button", { name: "Mark Metformin as taken" }));

    expect(api.logDose).toHaveBeenCalledWith("med_1_2026-11-15_0800", "taken");
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Metformin marked as taken"));
    const row = screen.getByText("Metformin").closest("li") as HTMLElement;
    expect(within(row).getByText("Taken")).toBeInTheDocument();
  });

  it("rolls back the optimistic update and reports the failure", async () => {
    vi.mocked(api.logDose).mockRejectedValue(new Error("boom"));
    const user = userEvent.setup();
    renderApp(<Today />);

    await user.click(await screen.findByRole("button", { name: "Mark Metformin as taken" }));

    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("couldn't save"));
    const row = screen.getByText("Metformin").closest("li");
    expect(row).not.toBeNull();
    expect(within(row as HTMLElement).getByText("Due now")).toBeInTheDocument();
    expect(within(row as HTMLElement).getByRole("button", { name: "Mark Metformin as taken" })).toBeInTheDocument();
  });

  it("shows a friendly empty state when nothing is scheduled", async () => {
    vi.mocked(api.getDoses).mockResolvedValue({ date: "2026-11-15", doses: [] });
    renderApp(<Today />);
    expect(await screen.findByText("No medicines today")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Add a medicine" })).toHaveAttribute("href", "/app/medicines");
  });

  it("offers a retry when loading fails", async () => {
    vi.mocked(api.getDoses).mockRejectedValueOnce(new Error("down")).mockResolvedValue({ date: "2026-11-15", doses });
    const user = userEvent.setup();
    renderApp(<Today />);
    await user.click(await screen.findByRole("button", { name: "Try again" }));
    expect(await screen.findByText("Metformin")).toBeInTheDocument();
  });
});
