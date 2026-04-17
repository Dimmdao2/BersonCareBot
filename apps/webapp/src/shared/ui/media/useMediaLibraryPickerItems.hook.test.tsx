/** @vitest-environment jsdom */

import { describe, expect, it, vi, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import {
  invalidateMediaLibraryPickerListCache,
  useMediaLibraryPickerItems,
} from "@/shared/ui/media/useMediaLibraryPickerItems";

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
    invalidateMediaLibraryPickerListCache();
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

  it("uses in-memory cache on reopen with same listUrl (single fetch)", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [sampleItem] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { result, rerender } = renderHook(
      ({ open }: { open: boolean }) =>
        useMediaLibraryPickerItems({ open, listUrl: "/api/admin/media?cache=test" }),
      { initialProps: { open: true } },
    );

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);

    rerender({ open: false });
    rerender({ open: true });

    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("refetches when reloadKey increments", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        json: async () => ({ ok: true, items: [sampleItem] }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { rerender } = renderHook(
      ({ reloadKey }: { reloadKey: number }) =>
        useMediaLibraryPickerItems({
          open: true,
          listUrl: "/api/admin/media?reload=key",
          reloadKey,
        }),
      { initialProps: { reloadKey: 0 } },
    );

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));

    rerender({ reloadKey: 1 });

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
