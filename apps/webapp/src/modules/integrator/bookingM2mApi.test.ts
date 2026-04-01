/**
 * Contract tests for bookingM2mApi.fetchSlots.
 *
 * Covers:
 * - happy path: integrator returns ok:true + correct slots array
 * - integrator returns ok:true but slots is not an array → throws (contract broken)
 * - integrator returns ok:false → throws with error code from integrator
 * - integrator returns HTTP 4xx/5xx → throws
 */
import { describe, expect, it, vi, afterEach } from "vitest";

vi.mock("@/modules/system-settings/integrationRuntime", () => ({
  getIntegratorApiUrl: async () => "http://integrator.test",
  getIntegratorWebhookSecret: async () => "secret-value",
}));

vi.mock("node:crypto", () => ({
  createHmac: () => ({
    update: () => ({
      digest: () => "fake-sig",
    }),
  }),
}));

// We need to intercept the actual postSigned, which is an internal function.
// Simplest approach: mock global fetch used by bookingM2mApi.
const globalFetchMock = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
  globalFetchMock.mockReset();
});

function mockFetch(body: Record<string, unknown>, status = 200) {
  globalFetchMock.mockResolvedValue({
    status,
    json: () => Promise.resolve(body),
  });
}

// We patch global fetch before importing the module
vi.stubGlobal("fetch", globalFetchMock);

import { createBookingSyncPort } from "./bookingM2mApi";

describe("createBookingSyncPort.fetchSlots", () => {
  it("returns BookingSlotsByDate[] when integrator returns valid slots array", async () => {
    const slots = [
      { date: "2026-04-10", slots: [{ startAt: "2026-04-10T10:00:00", endAt: "2026-04-10T11:00:00" }] },
    ];
    mockFetch({ ok: true, slots });
    const port = createBookingSyncPort();
    const result = await port.fetchSlots({ type: "online", category: "general", date: "2026-04-10" });
    expect(result).toEqual(slots);
  });

  it("throws rubitime_slots_contract_broken when integrator returns ok:true but slots is not an array", async () => {
    mockFetch({ ok: true, slots: null });
    const port = createBookingSyncPort();
    await expect(port.fetchSlots({ type: "online", category: "general" })).rejects.toThrow(
      "rubitime_slots_contract_broken",
    );
  });

  it("throws with integrator error code when ok:false", async () => {
    mockFetch({ ok: false, error: "slots_mapping_not_configured" });
    const port = createBookingSyncPort();
    await expect(port.fetchSlots({ type: "online", category: "general" })).rejects.toThrow(
      "slots_mapping_not_configured",
    );
  });

  it("throws rubitime_slots_failed when ok:false with no error field", async () => {
    mockFetch({ ok: false }, 502);
    const port = createBookingSyncPort();
    await expect(port.fetchSlots({ type: "online", category: "general" })).rejects.toThrow(
      "rubitime_slots_failed",
    );
  });

  it("throws rubitime_slots_failed when integrator returns HTTP 400", async () => {
    mockFetch({ ok: false, error: "invalid_slots_query" }, 400);
    const port = createBookingSyncPort();
    await expect(port.fetchSlots({ type: "online", category: "general" })).rejects.toThrow(
      "invalid_slots_query",
    );
  });

  it("does NOT silently return empty array when integrator returns malformed slots", async () => {
    mockFetch({ ok: true, slots: "not-an-array" });
    const port = createBookingSyncPort();
    await expect(port.fetchSlots({ type: "online", category: "general" })).rejects.toThrow();
  });
});
