import "../test-utils";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderApp, sampleMedication } from "../test-utils";
import { Medicines } from "./Medicines";
import { toMedicationInput, validateMedication, emptyMedication } from "./validation";

vi.mock("../../api/client", () => ({
  listMedications: vi.fn(),
  createMedication: vi.fn(),
  updateMedication: vi.fn(),
  deleteMedication: vi.fn(),
  scanPrescription: vi.fn(),
}));

import * as api from "../../api/client";

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listMedications).mockResolvedValue([]);
});

async function openForm(user: ReturnType<typeof userEvent.setup>) {
  await user.click(await screen.findByRole("button", { name: "Add a medicine" }));
  return within(await screen.findByRole("dialog"));
}

describe("medication form", () => {
  it("shows errors for an empty name and for no times", async () => {
    const user = userEvent.setup();
    renderApp(<Medicines />);
    const dialog = await openForm(user);

    await user.click(dialog.getByRole("button", { name: "Remove time 1" }));
    await user.click(dialog.getByRole("button", { name: "Add medicine" }));

    expect(await dialog.findByText(/enter the medicine's name/i)).toBeInTheDocument();
    expect(dialog.getByText(/enter the dose/i)).toBeInTheDocument();
    expect(dialog.getByText(/at least one time of day/i)).toBeInTheDocument();
    expect(api.createMedication).not.toHaveBeenCalled();
  });

  it("creates a medication with a contract-shaped body", async () => {
    vi.mocked(api.createMedication).mockResolvedValue(sampleMedication());
    const user = userEvent.setup();
    renderApp(<Medicines />);
    const dialog = await openForm(user);

    await user.type(dialog.getByLabelText(/medicine name/i), "  Metformin ");
    await user.type(dialog.getByLabelText(/^dose/i), "500 mg");
    await user.click(dialog.getByRole("button", { name: "Add medicine" }));

    await waitFor(() => expect(api.createMedication).toHaveBeenCalledTimes(1));
    expect(api.createMedication).toHaveBeenCalledWith({
      name: "Metformin",
      dosage: "500 mg",
      instructions: "",
      times: ["08:00"],
      daysOfWeek: [0, 1, 2, 3, 4, 5, 6],
      startDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      endDate: null,
      stock: null,
      refillAt: null,
      color: "white",
      shape: "round",
    });
  });

  it("flags low stock on the list", async () => {
    vi.mocked(api.listMedications).mockResolvedValue([sampleMedication({ stock: 3, refillAt: 5 })]);
    renderApp(<Medicines />);
    expect(await screen.findByText("Running low: 3 left")).toBeInTheDocument();
  });

  it("asks before deleting", async () => {
    vi.mocked(api.listMedications).mockResolvedValue([sampleMedication()]);
    vi.mocked(api.deleteMedication).mockResolvedValue(undefined);
    const user = userEvent.setup();
    renderApp(<Medicines />);

    await user.click(await screen.findByRole("button", { name: "Delete Metformin" }));
    expect(api.deleteMedication).not.toHaveBeenCalled();
    await user.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Yes, delete" }));
    await waitFor(() => expect(api.deleteMedication).toHaveBeenCalledWith("med_1"));
  });
});

describe("validateMedication", () => {
  it("accepts a complete form and sorts times", () => {
    const v = { ...emptyMedication("2026-11-15"), name: "A", dosage: "1", times: ["20:00", "08:00"] };
    expect(validateMedication(v)).toEqual({});
    expect(toMedicationInput(v).times).toEqual(["08:00", "20:00"]);
  });

  it("rejects duplicate times and an end date before the start", () => {
    const v = { ...emptyMedication("2026-11-15"), name: "A", dosage: "1", times: ["08:00", "08:00"], endDate: "2026-11-01" };
    const errors = validateMedication(v);
    expect(errors["times"]).toMatch(/only be listed once/);
    expect(errors["endDate"]).toMatch(/before the start/);
  });
});
