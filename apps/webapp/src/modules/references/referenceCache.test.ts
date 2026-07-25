import { describe, expect, it, vi, afterEach } from "vitest";

describe("referenceCache", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("loadReferenceItems parses ok response (browser-like env)", async () => {
    const mem: Record<string, string> = {};
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (k: string) => mem[k] ?? null,
        setItem: (k: string, v: string) => {
          mem[k] = v;
        },
        removeItem: (k: string) => {
          delete mem[k];
        },
        clear: () => {
          for (const k of Object.keys(mem)) delete mem[k];
        },
        key: () => null,
        length: 0,
      },
    });
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, items: [{ id: "1", code: "a", title: "A", sortOrder: 1 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadReferenceItems } = await import("./referenceCache");
    const items = await loadReferenceItems("symptom_type");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("A");
    expect(fetchMock).toHaveBeenCalledWith("/api/doctor/references/symptom_type");
    await loadReferenceItems("symptom_type");
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(mem).toEqual({});
  });

  it("resolves to an empty list instead of rejecting when fetch itself throws (dropped connection)", async () => {
    vi.stubGlobal("window", {});
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new Error("net::ERR_CONNECTION_REFUSED")),
    );
    const { loadReferenceItems } = await import("./referenceCache");
    await expect(loadReferenceItems("body_region")).resolves.toEqual([]);
  });
});
