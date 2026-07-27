import { afterEach, describe, expect, it, vi } from "vitest";

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

const globalFetchMock = vi.fn();

afterEach(() => {
  vi.restoreAllMocks();
  globalFetchMock.mockReset();
});

vi.stubGlobal("fetch", globalFetchMock);

import { createBookingSyncPort } from "./bookingM2mApi";

function bookingEventInput() {
  return {
    eventType: "booking.created" as const,
    idempotencyKey: "booking-created-test",
    payload: {
      bookingId: "2f14566f-a4de-4ab4-9336-5ddf806cd6ce",
      userId: "3f14566f-a4de-4ab4-9336-5ddf806cd6ce",
      bookingType: "online" as const,
      category: "general" as const,
      slotStart: "2026-04-10T10:00:00.000Z",
      slotEnd: "2026-04-10T11:00:00.000Z",
      contactName: "Ivan",
      contactPhone: "+79990001122",
    },
  };
}

describe("createBookingSyncPort.emitBookingEvent", () => {
  it("posts provider-neutral lifecycle events", async () => {
    let capturedUrl: string | undefined;
    let capturedBody: Record<string, unknown> | undefined;
    globalFetchMock.mockImplementationOnce(async (url: string, init?: RequestInit) => {
      capturedUrl = url;
      capturedBody = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
      return { status: 200, json: () => Promise.resolve({ ok: true }) };
    });

    const port = createBookingSyncPort();
    await port.emitBookingEvent(bookingEventInput());

    expect(capturedUrl).toBe("http://integrator.test/api/bersoncare/booking/lifecycle-event");
    expect(capturedBody?.eventType).toBe("booking.created");
    expect(capturedBody?.idempotencyKey).toBe("booking-created-test");
  });

  it("retries on HTTP 502 then succeeds", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      globalFetchMock
        .mockResolvedValueOnce({ status: 502, json: () => Promise.resolve({ ok: false }) })
        .mockResolvedValueOnce({ status: 502, json: () => Promise.resolve({ ok: false }) })
        .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({ ok: true }) });

      const port = createBookingSyncPort();
      const p = port.emitBookingEvent(bookingEventInput());
      await vi.advanceTimersByTimeAsync(5000);
      await expect(p).resolves.toBeUndefined();
      expect(globalFetchMock).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not retry on HTTP 400", async () => {
    globalFetchMock.mockResolvedValueOnce({
      status: 400,
      json: () => Promise.resolve({ ok: false, error: "bad_request" }),
    });

    const port = createBookingSyncPort();
    await expect(port.emitBookingEvent(bookingEventInput())).rejects.toThrow("bad_request");
    expect(globalFetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries once on fetch TypeError", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      globalFetchMock
        .mockRejectedValueOnce(new TypeError("network down"))
        .mockResolvedValueOnce({ status: 200, json: () => Promise.resolve({ ok: true }) });

      const port = createBookingSyncPort();
      const p = port.emitBookingEvent(bookingEventInput());
      await vi.advanceTimersByTimeAsync(5000);
      await expect(p).resolves.toBeUndefined();
      expect(globalFetchMock).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
