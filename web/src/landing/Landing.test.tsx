import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import Landing from "./Landing";

class StubObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

beforeAll(() => {
  vi.stubGlobal("IntersectionObserver", StubObserver);
  vi.stubGlobal("ResizeObserver", StubObserver);
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
    onchange: null,
  }));
  vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockReturnValue(null);
});

afterEach(cleanup);

function renderLanding() {
  return render(
    <MemoryRouter>
      <Landing />
    </MemoryRouter>,
  );
}

describe("Landing", () => {
  it("has exactly one h1", () => {
    renderLanding();
    expect(screen.getAllByRole("heading", { level: 1 })).toHaveLength(1);
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Care that stays close.");
  });

  it("links the primary calls to action into the app", () => {
    renderLanding();
    const starts = screen.getAllByRole("link", { name: /start a care circle/i });
    expect(starts.length).toBeGreaterThan(0);
    for (const link of starts) expect(link).toHaveAttribute("href", "/app?start=1");
    const joins = screen.getAllByRole("link", { name: /join with a code/i });
    expect(joins.length).toBeGreaterThan(0);
    for (const link of joins) expect(link).toHaveAttribute("href", "/app?join=1");
    for (const link of screen.getAllByRole("link", { name: /^sign in$/i })) {
      expect(link).toHaveAttribute("href", "/app");
    }
  });

  it("presents the phone mockup as one labelled image", () => {
    renderLanding();
    const phone = screen.getByRole("img", { name: /today screen/i });
    expect(phone).toHaveAccessibleName(/metformin 500 mg/i);
  });

  it("hides decorative layers from assistive technology", () => {
    const { container } = renderLanding();
    expect(container.querySelector(".aurora")).toHaveAttribute("aria-hidden", "true");
    expect(container.querySelector(".ld-stage__glow")).toHaveAttribute("aria-hidden", "true");
    for (const chip of container.querySelectorAll(".ld-chip-shell")) {
      expect(chip).toHaveAttribute("aria-hidden", "true");
    }
  });

  it("offers a skip link to the main landmark", () => {
    renderLanding();
    expect(screen.getByRole("link", { name: /skip to main content/i })).toHaveAttribute("href", "#main");
    expect(screen.getByRole("main")).toHaveAttribute("id", "main");
  });

  it("labels the text size slider and keeps the disclaimer", () => {
    renderLanding();
    expect(screen.getByRole("slider", { name: /text size/i })).toBeInTheDocument();
    expect(screen.getByText("Not a substitute for professional medical advice.")).toBeInTheDocument();
  });
});
