/** @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { useMediaLibraryPickerItems } from "@/shared/ui/media/useMediaLibraryPickerItems";

const sampleItem = {
  id: "x",
  kind: "image" as const,
  filename: "x.png",
  mimeType: "image/png",
  size: 1,
  createdAt: "2026-01-01T00:00:00.000Z",
  url: "/api/media/x",
};

describe("useMediaLibraryPickerItems", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("does not set items from a stale response after listUrl changes (superseded request)", async () => {
    const stale = [{ ...sampleItem, id: "stale", filename: "stale.png" }];
    const fresh = [{ ...sampleItem, id: "fresh", filename: "fresh.png" }];

    let resolveSlow!: () => void;
    const slowGate = new Promise<void>((r) => {
      resolveSlow = r;
    });

    const fetchMock = vi.fn();
    fetchMock.mockImplementationOnce(() =>
      slowGate.then(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, items: stale }),
        }),
      ),
    );
    fetchMock.mockImplementationOnce(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: fresh }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ listUrl }: { listUrl: string }) =>
        useMediaLibraryPickerItems({ open: true, listUrl }),
      { initialProps: { listUrl: "/api/admin/media?batch=1" } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ listUrl: "/api/admin/media?batch=2" });

    await waitFor(() => expect(result.current.items).toEqual(fresh));

    await act(async () => {
      resolveSlow();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.items).toEqual(fresh);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("does not set items when picker closes before the first response", async () => {
    let resolveSlow!: () => void;
    const slowGate = new Promise<void>((r) => {
      resolveSlow = r;
    });

    const fetchMock = vi.fn(() =>
      slowGate.then(() =>
        Promise.resolve({
          ok: true,
          json: async () => ({ ok: true, items: [sampleItem] }),
        }),
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useMediaLibraryPickerItems({ open, listUrl: "/api/admin/media" }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ open: false });

    await act(async () => {
      resolveSlow();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(result.current.items).toEqual([]);
  });
});
