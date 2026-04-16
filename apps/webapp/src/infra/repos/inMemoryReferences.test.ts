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

  it("lists categories and all category items for management", async () => {
    const categories = await inMemoryReferencesPort.listCategories();
    expect(categories.some((c) => c.code === "body_region")).toBe(true);

    const added = await inMemoryReferencesPort.insertItemStaff({
      categoryCode: "symptom_type",
      code: "inactive_probe",
      title: "Неактивный элемент",
    });
    await inMemoryReferencesPort.updateItem(added.id, { isActive: false });

    const allItems = await inMemoryReferencesPort.listItemsForManagementByCategoryCode("symptom_type");
    expect(allItems.some((i) => i.id === added.id && i.isActive === false)).toBe(true);
  });

  it("insertItemStaff allows non-extensible category and updateItem changes fields", async () => {
    const inserted = await inMemoryReferencesPort.insertItemStaff({
      categoryCode: "body_region",
      code: "test_region",
      title: "Тестовый регион",
      sortOrder: 50,
    });
    expect(inserted.categoryId).toBe("rc-body_region");

    const updated = await inMemoryReferencesPort.updateItem(inserted.id, {
      title: "Тестовый регион 2",
      isActive: false,
    });
    expect(updated.title).toBe("Тестовый регион 2");
    expect(updated.isActive).toBe(false);
  });
});
