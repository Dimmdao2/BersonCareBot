/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useDoctorOnlineIntakeNewCount } from "./useDoctorOnlineIntakeNewCount";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("useDoctorOnlineIntakeNewCount", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    mockFetch.mockReset();
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("fetches total on mount when visible", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () =>
        Promise.resolve({
          items: [{ id: "x" }],
          total: 7,
          page: 1,
          totalPages: 7,
        }),
    });
    const { result } = renderHook(() => useDoctorOnlineIntakeNewCount());
    await waitFor(() => {
      expect(result.current).toBe(7);
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/doctor/online-intake?status=new&limit=1");
  });

  it("does not fetch when tab starts hidden", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "hidden",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 9, page: 1, totalPages: 0 }),
    });
    const { result } = renderHook(() => useDoctorOnlineIntakeNewCount());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("polls every 20s", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 1, page: 1, totalPages: 1 }),
    });
    renderHook(() => useDoctorOnlineIntakeNewCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 2, page: 1, totalPages: 1 }),
    });
    await act(async () => {
      vi.advanceTimersByTime(20_000);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("does not throw on fetch error", async () => {
    mockFetch.mockRejectedValue(new Error("network"));
    const { result } = renderHook(() => useDoctorOnlineIntakeNewCount());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
  });

  it("refetches when tab becomes visible", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 1, page: 1, totalPages: 1 }),
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "hidden",
    });
    renderHook(() => useDoctorOnlineIntakeNewCount());
    await act(async () => {
      await Promise.resolve();
    });
    expect(mockFetch).not.toHaveBeenCalled();

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ items: [], total: 4, page: 1, totalPages: 1 }),
    });
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "visible",
    });
    document.dispatchEvent(new Event("visibilitychange"));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));
  });
});
