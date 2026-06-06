/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import toast from "react-hot-toast";
import { useRescheduleBooking } from "./useRescheduleBooking";

const push = vi.fn();

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn(), prefetch: vi.fn() }),
}));

vi.mock("react-hot-toast", () => ({
  default: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }),
}));

describe("useRescheduleBooking", () => {
  beforeEach(() => {
    push.mockClear();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true }),
      } as Response),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("returns partial rubitimeMirrorFailed on successful reschedule", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, rubitimeMirrorFailed: true }),
    } as Response);

    const { result } = renderHook(() => useRescheduleBooking());
    let outcome: Awaited<ReturnType<typeof result.current.rescheduleBooking>> | undefined;
    await act(async () => {
      outcome = await result.current.rescheduleBooking({
        bookingId: "550e8400-e29b-41d4-a716-446655440001",
        slotStart: "2026-06-10T10:00:00.000Z",
        slotEnd: "2026-06-10T11:00:00.000Z",
      });
    });

    expect(outcome).toEqual({ ok: true, partial: { rubitimeMirrorFailed: true } });
    expect(toast).not.toHaveBeenCalled();
  });

  it("maps API error codes to Russian messages", async () => {
    vi.mocked(fetch).mockResolvedValueOnce({
      ok: false,
      json: async () => ({ ok: false, error: "slot_overlap" }),
    } as Response);

    const { result } = renderHook(() => useRescheduleBooking());
    await act(async () => {
      await result.current.rescheduleBooking({
        bookingId: "550e8400-e29b-41d4-a716-446655440001",
        slotStart: "2026-06-10T10:00:00.000Z",
        slotEnd: "2026-06-10T11:00:00.000Z",
      });
    });

    expect(result.current.error).toBe("Это время уже занято");
  });
});
