import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, appointmentIcsUrl, createMedication, getDoses, listMembers, logDose, logout } from "./client";

const json = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => {
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("api client", () => {
  it("sends the CSRF header, cookies and JSON body", async () => {
    fetchMock.mockResolvedValue(json(200, { id: "d1", status: "taken" }));
    await logDose("med_1_2026-11-15_0800", "taken");

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/doses/med_1_2026-11-15_0800/log");
    expect(init.method).toBe("POST");
    expect(init.credentials).toBe("same-origin");
    const headers = init.headers as Record<string, string>;
    expect(headers["X-Requested-With"]).toBe("hearth");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({ status: "taken" });
  });

  it("sends the header on GET requests and builds the query string", async () => {
    fetchMock.mockResolvedValue(json(200, { date: "2026-11-15", doses: [] }));
    await getDoses("2026-11-15");
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/v1/doses?date=2026-11-15");
    expect((init.headers as Record<string, string>)["X-Requested-With"]).toBe("hearth");
    expect(init.body).toBeUndefined();
  });

  it("unwraps list envelopes", async () => {
    fetchMock.mockResolvedValue(json(200, { members: [{ id: "m1" }] }));
    await expect(listMembers()).resolves.toEqual([{ id: "m1" }]);
  });

  it("resolves 204 responses with no body", async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    await expect(logout()).resolves.toBeUndefined();
  });

  it("parses contract errors into ApiError", async () => {
    fetchMock.mockResolvedValue(
      json(400, { error: { code: "INVALID_INPUT", message: "Bad", details: [{ field: "name", reason: "Required" }] } }),
    );
    const err = await createMedication({
      name: "",
      dosage: "",
      instructions: "",
      times: [],
      daysOfWeek: [],
      startDate: "2026-11-15",
      endDate: null,
      stock: null,
      refillAt: null,
      color: "white",
      shape: "round",
    }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({
      code: "INVALID_INPUT",
      status: 400,
      message: "Bad",
      details: [{ field: "name", reason: "Required" }],
    });
  });

  it("falls back to INTERNAL when the error body is not the contract shape", async () => {
    fetchMock.mockResolvedValue(new Response("<html>oops</html>", { status: 502 }));
    await expect(listMembers()).rejects.toMatchObject({ code: "INTERNAL", status: 502 });
  });

  it("maps network failures to code NETWORK", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(listMembers()).rejects.toMatchObject({ name: "ApiError", code: "NETWORK" });
  });

  it("turns a stalled request into a TIMEOUT ApiError after 20 seconds", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const pending = listMembers().catch((e: unknown) => e);
    await vi.advanceTimersByTimeAsync(20_000);
    const err = await pending;
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ code: "TIMEOUT" });
  });

  it("propagates caller cancellation as an AbortError, not an ApiError", async () => {
    fetchMock.mockImplementation(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")));
        }),
    );
    const controller = new AbortController();
    const pending = listMembers(controller.signal).catch((e: unknown) => e);
    controller.abort();
    const err = await pending;
    expect(err).not.toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ name: "AbortError" });
  });

  it("builds an encoded calendar download URL", () => {
    expect(appointmentIcsUrl("apt 1")).toBe("/api/v1/appointments/apt%201/ics");
  });
});
