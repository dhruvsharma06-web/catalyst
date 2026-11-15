import "../test-utils";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Account } from "../../api/types";
import { sampleMe } from "../test-utils";
import { AuthScreen } from "./Auth";
import { secretStrength } from "./validation";
import { CircleHub } from "./Welcome";

vi.mock("../../api/client", () => ({
  createCircle: vi.fn(),
  joinCircle: vi.fn(),
  openCircle: vi.fn(),
  login: vi.fn(),
  signup: vi.fn(),
}));

import * as api from "../../api/client";

const me = sampleMe("caretaker");
const account = (withCircle = false): Account => ({
  user: { id: "u_1", name: "Meera Iyer", email: "meera@example.com", createdAt: "2026-11-01T00:00:00.000Z" },
  circles: withCircle ? [{ circle: me.circle, role: "caretaker" }] : [],
  active: null,
});

const renderHub = (route = "/app", onOpen = vi.fn(), acc = account()) =>
  render(
    <MemoryRouter initialEntries={[route]}>
      <CircleHub account={acc} onOpen={onOpen} onSignOut={vi.fn()} />
    </MemoryRouter>,
  );

beforeEach(() => vi.resetAllMocks());

describe("AuthScreen", () => {
  it("validates sign-up input before calling the API", async () => {
    const user = userEvent.setup();
    render(<AuthScreen initialMode="signup" onSignedIn={vi.fn()} />);
    await user.type(screen.getByLabelText("Your name"), "Meera");
    await user.type(screen.getByLabelText("Email"), "not-an-email");
    await user.type(screen.getByLabelText("Password"), "short");
    await user.click(screen.getByRole("button", { name: "Create account" }));
    expect(await screen.findByText("Enter a valid email address.")).toBeInTheDocument();
    expect(screen.getByText("Use at least 10 characters.")).toBeInTheDocument();
    expect(api.signup).not.toHaveBeenCalled();
  });

  it("signs in and hands the account to the app", async () => {
    vi.mocked(api.login).mockResolvedValue(account());
    const onSignedIn = vi.fn();
    const user = userEvent.setup();
    render(<AuthScreen onSignedIn={onSignedIn} />);
    await user.type(screen.getByLabelText("Email"), "meera@example.com");
    await user.type(screen.getByLabelText("Password"), "correct-horse-battery");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    await waitFor(() => expect(onSignedIn).toHaveBeenCalledWith(account()));
    expect(api.login).toHaveBeenCalledWith({ email: "meera@example.com", password: "correct-horse-battery" });
  });

  it("shows one plain message when sign-in fails", async () => {
    const { ApiError } = await import("../../api/errors");
    vi.mocked(api.login).mockRejectedValue(new ApiError("UNAUTHORIZED", "That email and password don't match. Please try again.", 401));
    const user = userEvent.setup();
    render(<AuthScreen onSignedIn={vi.fn()} />);
    await user.type(screen.getByLabelText("Email"), "meera@example.com");
    await user.type(screen.getByLabelText("Password"), "wrong-password");
    await user.click(screen.getByRole("button", { name: "Sign in" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("don't match");
  });
});

describe("CircleHub", () => {
  it("opens the Join tab when the URL has ?join=1", () => {
    renderHub("/app?join=1");
    expect(screen.getByRole("tab", { name: "Join with a code" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByLabelText("Circle code")).toBeInTheDocument();
  });

  it("lists the user's circles and opens one", async () => {
    vi.mocked(api.openCircle).mockResolvedValue(me);
    const onOpen = vi.fn();
    const user = userEvent.setup();
    renderHub("/app", onOpen, account(true));
    await user.click(screen.getByRole("button", { name: `Open ${me.circle.elderName}'s circle` }));
    await waitFor(() => expect(onOpen).toHaveBeenCalledWith(me));
    expect(api.openCircle).toHaveBeenCalledWith(me.circle.id);
  });

  it("rejects mismatched passcodes without calling the API", async () => {
    const user = userEvent.setup();
    renderHub();
    await user.type(screen.getByLabelText("Who is this circle for?"), "Kamala");
    await user.type(screen.getByLabelText("Circle passcode"), "maple-1234");
    await user.type(screen.getByLabelText("Confirm passcode"), "maple-9999");
    await user.click(screen.getByRole("button", { name: "Create circle" }));
    expect(await screen.findByText("The passcodes don't match.")).toBeInTheDocument();
    expect(api.createCircle).not.toHaveBeenCalled();
  });

  it("creates a circle, then shows the code with the separate-sharing advice", async () => {
    vi.mocked(api.createCircle).mockResolvedValue(me);
    const onOpen = vi.fn();
    const user = userEvent.setup();
    renderHub("/app", onOpen);
    await user.type(screen.getByLabelText("Who is this circle for?"), "Kamala");
    await user.type(screen.getByLabelText("Circle passcode"), "maple-1234");
    await user.type(screen.getByLabelText("Confirm passcode"), "maple-1234");
    await user.click(screen.getByRole("button", { name: "Create circle" }));

    await waitFor(() => expect(api.createCircle).toHaveBeenCalled());
    expect(api.createCircle).toHaveBeenCalledWith(expect.objectContaining({ elderName: "Kamala", passcode: "maple-1234", role: "caretaker" }));
    expect(await screen.findByText(me.circle.code)).toBeInTheDocument();
    expect(screen.getByText(/separate messages/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Continue" }));
    expect(onOpen).toHaveBeenCalledWith(me);
  });
});

describe("secretStrength", () => {
  it("grades by length and variety", () => {
    expect(secretStrength("abc", 6).level).toBe("weak");
    expect(secretStrength("abcdef", 6).level).toBe("ok");
    expect(secretStrength("Maple-1234", 6).level).toBe("strong");
  });
});
