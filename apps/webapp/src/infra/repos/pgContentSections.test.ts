import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { createInMemoryContentSectionsPort, inMemoryContentSectionsPort } from "./pgContentSections";

const __dirname = dirname(fileURLToPath(import.meta.url));

describe("pgContentSections (runtime constraints)", () => {
  it("uses Drizzle only — no getPool / pool.query / client.query", () => {
    const src = readFileSync(join(__dirname, "pgContentSections.ts"), "utf8");
    expect(src).not.toMatch(/\bgetPool\b/);
    expect(src).not.toMatch(/\bpool\.query\b/);
    expect(src).not.toMatch(/\bclient\.query\b/);
    expect(src).toContain("getDrizzle");
  });
});

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
      coverImageUrl: null,
      iconImageUrl: null,
    });
    const row = await p.getBySlug("warmups");
    expect(row?.title).toBe("Разминки");
    expect(row?.coverImageUrl).toBeNull();
    expect(row?.iconImageUrl).toBeNull();
    expect((await p.listVisible()).map((r) => r.slug)).toEqual(["warmups"]);
  });

  it("stores cover and icon media fields", async () => {
    const p = createInMemoryContentSectionsPort();
    await p.upsert({
      slug: "with-media",
      title: "With Media",
      description: "",
      sortOrder: 0,
      isVisible: true,
      requiresAuth: false,
      coverImageUrl: "/api/media/11111111-1111-1111-1111-111111111111",
      iconImageUrl: "/api/media/22222222-2222-2222-2222-222222222222",
    });
    const row = await p.getBySlug("with-media");
    expect(row?.coverImageUrl).toContain("/api/media/");
    expect(row?.iconImageUrl).toContain("/api/media/");
    const visible = await p.listVisible();
    expect(visible[0]?.coverImageUrl).toContain("/api/media/");
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
      coverImageUrl: null,
      iconImageUrl: null,
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
      coverImageUrl: null,
      iconImageUrl: null,
    });
    await p.upsert({
      slug: "b",
      title: "B",
      description: "",
      sortOrder: 1,
      isVisible: true,
      requiresAuth: false,
      coverImageUrl: null,
      iconImageUrl: null,
    });
    await p.reorderSlugs(["b", "a"]);
    const all = await p.listAll();
    expect(all.find((r) => r.slug === "b")?.sortOrder).toBe(0);
    expect(all.find((r) => r.slug === "a")?.sortOrder).toBe(1);
  });
});
