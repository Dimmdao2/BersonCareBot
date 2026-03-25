/** @vitest-environment jsdom */
import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useReminderUnreadCount } from "./useReminderUnreadCount";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("useReminderUnreadCount", () => {
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

  it("fetches count on mount when visible", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, count: 4 }),
    });
    const { result } = renderHook(() => useReminderUnreadCount());
    await waitFor(() => {
      expect(result.current).toBe(4);
    });
    expect(mockFetch).toHaveBeenCalledWith("/api/patient/reminders/unread-count");
  });

  it("does not update count when tab starts hidden (first tick skipped)", async () => {
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      writable: true,
      value: "hidden",
    });
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, count: 9 }),
    });
    const { result } = renderHook(() => useReminderUnreadCount());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("polls on interval (60s)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, count: 1 }),
    });
    renderHook(() => useReminderUnreadCount());
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(1));

    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: true, count: 2 }),
    });
    await act(async () => {
      vi.advanceTimersByTime(60_000);
    });
    await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(2));
  });

  it("ignores failed response body (ok: false)", async () => {
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ ok: false, error: "x" }),
    });
    const { result } = renderHook(() => useReminderUnreadCount());
    await act(async () => {
      await Promise.resolve();
    });
    expect(result.current).toBe(0);
  });
});
