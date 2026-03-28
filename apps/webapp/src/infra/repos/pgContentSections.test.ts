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
    });
    expect(await p.listVisible()).toEqual([]);
    expect((await p.listAll()).length).toBe(1);
  });
});
