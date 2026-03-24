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
      json: async () => ({ ok: true, items: [{ id: "1", code: "a", title: "A", sortOrder: 1 }] }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const { loadReferenceItems } = await import("./referenceCache");
    const items = await loadReferenceItems("symptom_type");
    expect(items).toHaveLength(1);
    expect(items[0]?.title).toBe("A");
  });
});
