/** @vitest-environment jsdom */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import {
  notifyPatientSupportUnreadCountChanged,
  usePatientSupportUnreadCount,
} from "./useSupportUnreadPolling";

describe("usePatientSupportUnreadCount", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ ok: true, unreadCount: 3 }),
      }),
    );
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible",
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("refetches unread count when notifyPatientSupportUnreadCountChanged fires", async () => {
    const fetchMock = vi.mocked(fetch);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ ok: true, unreadCount: 3 }),
    } as Response);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, unreadCount: 0 }),
    } as Response);

    const { result } = renderHook(() => usePatientSupportUnreadCount());

    await waitFor(() => expect(result.current).toBe(3));

    act(() => {
      notifyPatientSupportUnreadCountChanged();
    });

    await waitFor(() => expect(result.current).toBe(0));
    expect(fetchMock.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});
