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

  it("fetchSlots v2 posts explicit Rubitime IDs and normalizes times[] with duration", async () => {
    globalFetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(body.version).toBe("v2");
      expect(body.rubitimeBranchId).toBe("b1");
      expect(body.rubitimeCooperatorId).toBe("c1");
      expect(body.rubitimeServiceId).toBe("s1");
      return {
        status: 200,
        json: () =>
          Promise.resolve({
            ok: true,
            slots: [{ date: "2026-04-10", times: ["10:00"] }],
          }),
      };
    });
    const port = createBookingSyncPort();
    const result = await port.fetchSlots({
      version: "v2",
      rubitimeBranchId: "b1",
      rubitimeCooperatorId: "c1",
      rubitimeServiceId: "s1",
      slotDurationMinutes: 30,
      date: "2026-04-10",
    });
    expect(result).toHaveLength(1);
    expect(result[0]!.slots).toHaveLength(1);
    expect(result[0]!.slots[0]!.startAt).toContain("2026-04-10T10:00:00+03:00");
  });

  it("createRecord v2 posts patient + localBookingId and reads rubitimeRecordId", async () => {
    globalFetchMock.mockImplementationOnce(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      expect(body.version).toBe("v2");
      expect(body.localBookingId).toBe("local-uuid");
      expect(body).not.toHaveProperty("category");
      return {
        status: 200,
        json: () => Promise.resolve({ ok: true, rubitimeRecordId: "rec-v2" }),
      };
    });
    const port = createBookingSyncPort();
    const out = await port.createRecord({
      version: "v2",
      rubitimeBranchId: "b1",
      rubitimeCooperatorId: "c1",
      rubitimeServiceId: "s1",
      slotStart: "2026-04-10T10:00:00+03:00",
      contactName: "Ann",
      contactPhone: "+79990001122",
      localBookingId: "local-uuid",
    });
    expect(out.rubitimeId).toBe("rec-v2");
  });

  it("propagates structured integrator error code from JSON error.code", async () => {
    mockFetch({ ok: false, error: { code: "rubitime_timeout", message: "slow" } }, 504);
    const port = createBookingSyncPort();
    await expect(
      port.fetchSlots({ version: "v2", rubitimeBranchId: "b", rubitimeCooperatorId: "c", rubitimeServiceId: "s", slotDurationMinutes: 60 }),
    ).rejects.toThrow("rubitime_timeout");
  });
});
