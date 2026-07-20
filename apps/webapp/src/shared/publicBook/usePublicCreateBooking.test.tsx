/** @vitest-environment jsdom */

import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { usePublicCreateBooking } from "./usePublicCreateBooking";

vi.mock("./attributionStorage", () => ({
  readStoredPublicBookingAttribution: () => ({}),
}));

describe("usePublicCreateBooking organization continuity", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("includes orgSlug in the public create body", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        ok: true,
        booking: {
          id: "booking-a",
          slotStart: "2026-07-20T10:00:00.000Z",
          slotEnd: "2026-07-20T11:00:00.000Z",
          status: "confirmed",
        },
      }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { result } = renderHook(() => usePublicCreateBooking());

    await act(async () => {
      await result.current.createBooking({
        selection: {
          type: "in_person",
          cityCode: "online",
          cityTitle: "Онлайн",
          branchId: "550e8400-e29b-41d4-a716-446655440001",
          serviceId: "550e8400-e29b-41d4-a716-446655440002",
          serviceTitle: "Консультация",
          orgSlug: "clinic-a",
        },
        slot: {
          startAt: "2026-07-20T10:00:00.000Z",
          endAt: "2026-07-20T11:00:00.000Z",
        },
        contactName: "Иван Иванов",
        contactPhone: "+79001234567",
      });
    });

    const request = fetchMock.mock.calls[0]?.[1] as RequestInit;
    expect(JSON.parse(String(request.body))).toMatchObject({
      type: "in_person",
      orgSlug: "clinic-a",
    });
  });
});
