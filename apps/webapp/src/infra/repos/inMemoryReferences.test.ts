import { describe, expect, it } from "vitest";
import { inMemoryReferencesPort } from "./inMemoryReferences";

/** Shared singleton — run these tests sequentially to avoid cross-test mutation. */
describe.sequential("inMemoryReferencesPort", () => {
  it("returns seeded symptom_type items in sort order", async () => {
    const items = await inMemoryReferencesPort.listActiveItemsByCategoryCode("symptom_type");
    expect(items.length).toBeGreaterThan(0);
    expect(items[0].title).toBe("Боль");
  });

  it("inserts item only for extensible category", async () => {
    const added = await inMemoryReferencesPort.insertItem({
      categoryCode: "symptom_type",
      code: "doc_test",
      title: "Тест врача",
    });
    expect(added.title).toBe("Тест врача");
    await expect(
      inMemoryReferencesPort.insertItem({
        categoryCode: "body_region",
        code: "x",
        title: "bad",
      })
    ).rejects.toThrow("category_not_extensible");
  });

  it("archives item so it is not listed", async () => {
    const items = await inMemoryReferencesPort.listActiveItemsByCategoryCode("symptom_type");
    const first = items[0];
    await inMemoryReferencesPort.archiveItem(first.id);
    const after = await inMemoryReferencesPort.listActiveItemsByCategoryCode("symptom_type");
    expect(after.some((i) => i.id === first.id)).toBe(false);
  });
});
