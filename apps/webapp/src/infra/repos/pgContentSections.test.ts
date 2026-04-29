import { describe, expect, it } from "vitest";
import { createInMemoryContentSectionsPort, inMemoryContentSectionsPort } from "./pgContentSections";

describe("inMemoryContentSectionsPort", () => {
  it("returns empty lists", async () => {
    expect(await inMemoryContentSectionsPort.listVisible()).toEqual([]);
    expect(await inMemoryContentSectionsPort.listAll()).toEqual([]);
    expect(await inMemoryContentSectionsPort.getBySlug("x")).toBeNull();
  });
});

describe("createInMemoryContentSectionsPort", () => {
  it("listVisible is empty initially", async () => {
    const p = createInMemoryContentSectionsPort();
    expect(await p.listVisible()).toEqual([]);
  });

  it("upsert then getBySlug and listVisible", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "warmups",
      title: "Разминки",
      description: "",
      sortOrder: 2,
      isVisible: true,
      requiresAuth: false,
    });
    const row = await p.getBySlug("warmups");
    expect(row?.title).toBe("Разминки");
    expect((await p.listVisible()).map((r) => r.slug)).toEqual(["warmups"]);
  });

  it("hides non-visible sections from listVisible", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "hidden",
      title: "H",
      description: "",
      sortOrder: 0,
      isVisible: false,
      requiresAuth: false,
    });
    expect(await p.listVisible()).toEqual([]);
    expect((await p.listAll()).length).toBe(1);
  });

  it("reorderSlugs updates sort_order indices", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "a",
      title: "A",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
    });
    await p.upsert({
      slug: "b",
      title: "B",
      description: "",
      sortOrder: 1,
      isVisible: true,
      requiresAuth: false,
    });
    await p.reorderSlugs(["b", "a"]);
    const all = await p.listAll();
    expect(all.find((r) => r.slug === "b")?.sortOrder).toBe(0);
    expect(all.find((r) => r.slug === "a")?.sortOrder).toBe(1);
  });

  it("renameSectionSlug moves slug and supports redirect lookup", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "alpha",
      title: "A",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
    });
    const r = await p.renameSectionSlug("alpha", "beta");
    expect(r).toEqual({ ok: true, newSlug: "beta" });
    expect(await p.getBySlug("alpha")).toBeNull();
    expect((await p.getBySlug("beta"))?.title).toBe("A");
    expect(await p.getRedirectNewSlugForOldSlug("alpha")).toBe("beta");
  });

  it("renameSectionSlug rejects collision", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "a",
      title: "A",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
    });
    await p.upsert({
      slug: "b",
      title: "B",
      description: "",
      sortOrder: 1,
      isVisible: true,
      requiresAuth: false,
    });
    const r = await p.renameSectionSlug("a", "b");
    expect(r.ok).toBe(false);
  });
});
