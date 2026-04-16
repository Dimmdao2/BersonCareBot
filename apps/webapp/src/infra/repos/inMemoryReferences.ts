/**
 * In-memory ReferencesPort for tests and dev without DATABASE_URL.
 */
import type { ReferencesPort } from "@/modules/references/ports";
import type { ReferenceCategory, ReferenceItem } from "@/modules/references/types";

const categories: ReferenceCategory[] = [
  {
    id: "rc-symptom_type",
    code: "symptom_type",
    title: "Тип симптома",
    isUserExtensible: true,
    tenantId: null,
  },
  {
    id: "rc-body_region",
    code: "body_region",
    title: "Область тела",
    isUserExtensible: false,
    tenantId: null,
  },
  {
    id: "rc-diagnosis",
    code: "diagnosis",
    title: "Диагноз",
    isUserExtensible: true,
    tenantId: null,
  },
  {
    id: "rc-disease_stage",
    code: "disease_stage",
    title: "Стадия",
    isUserExtensible: false,
    tenantId: null,
  },
  {
    id: "rc-load_type",
    code: "load_type",
    title: "Тип нагрузки",
    isUserExtensible: false,
    tenantId: null,
  },
];

const items: ReferenceItem[] = [
  {
    id: "ri-pain",
    categoryId: "rc-symptom_type",
    code: "pain",
    title: "Боль",
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-neck",
    categoryId: "rc-body_region",
    code: "neck",
    title: "Шея",
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
];

function ensureUniqueCode(categoryId: string, code: string): void {
  if (
    items.some(
      (i) => i.categoryId === categoryId && i.code === code && i.deletedAt == null
    )
  ) {
    throw new Error("duplicate_code");
  }
}

export const inMemoryReferencesPort: ReferencesPort = {
  async listCategories() {
    return [...categories].sort((a, b) => a.title.localeCompare(b.title));
  },

  async findCategoryByCode(categoryCode) {
    return categories.find((c) => c.code === categoryCode) ?? null;
  },

  async listActiveItemsByCategoryCode(categoryCode) {
    const cat = await this.findCategoryByCode(categoryCode);
    if (!cat) return [];
    return items
      .filter((i) => i.categoryId === cat.id && i.isActive && i.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  },

  async listItemsForManagementByCategoryCode(categoryCode) {
    const cat = await this.findCategoryByCode(categoryCode);
    if (!cat) return [];
    return items
      .filter((i) => i.categoryId === cat.id && i.deletedAt == null)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  },

  async insertItem(params) {
    const cat = await this.findCategoryByCode(params.categoryCode);
    if (!cat) throw new Error("category_not_found");
    if (!cat.isUserExtensible) throw new Error("category_not_extensible");
    ensureUniqueCode(cat.id, params.code);
    const item: ReferenceItem = {
      id: `ri-${params.code}-${Date.now()}`,
      categoryId: cat.id,
      code: params.code,
      title: params.title,
      sortOrder: 999,
      isActive: true,
      deletedAt: null,
      metaJson: params.metaJson ?? {},
    };
    items.push(item);
    return item;
  },

  async insertItemStaff(params) {
    const cat = await this.findCategoryByCode(params.categoryCode);
    if (!cat) throw new Error("category_not_found");
    ensureUniqueCode(cat.id, params.code);
    const item: ReferenceItem = {
      id: `ri-${params.code}-${Date.now()}`,
      categoryId: cat.id,
      code: params.code,
      title: params.title,
      sortOrder: params.sortOrder ?? 999,
      isActive: true,
      deletedAt: null,
      metaJson: params.metaJson ?? {},
    };
    items.push(item);
    return item;
  },

  async updateItem(itemId, input) {
    const item = items.find((i) => i.id === itemId && i.deletedAt == null);
    if (!item) throw new Error("item_not_found");
    if (input.title !== undefined) item.title = input.title;
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    return item;
  },

  async saveCatalog(categoryCode, input) {
    const cat = await this.findCategoryByCode(categoryCode);
    if (!cat) throw new Error("category_not_found");
    const normalizedCodes = input.additions.map((addition) => addition.code.trim().toLowerCase());
    if (new Set(normalizedCodes).size !== normalizedCodes.length) {
      throw new Error("duplicate_code");
    }

    for (const update of input.updates) {
      const item = items.find((i) => i.id === update.id && i.categoryId === cat.id && i.deletedAt == null);
      if (!item) continue;
      item.title = update.title;
      item.sortOrder = update.sortOrder;
      item.isActive = update.isActive;
    }

    for (const addition of input.additions) {
      const normalizedCode = addition.code.trim().toLowerCase();
      ensureUniqueCode(cat.id, normalizedCode);
      items.push({
        id: `ri-${normalizedCode}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        categoryId: cat.id,
        code: normalizedCode,
        title: addition.title,
        sortOrder: addition.sortOrder,
        isActive: true,
        deletedAt: null,
        metaJson: {},
      });
    }
  },

  async archiveItem(itemId) {
    const i = items.find((x) => x.id === itemId && x.deletedAt == null);
    if (i) i.isActive = false;
  },

  async softDeleteItem(itemId) {
    const i = items.find((x) => x.id === itemId && x.deletedAt == null);
    if (i) i.deletedAt = new Date().toISOString();
  },

  async findItemById(itemId) {
    return items.find((i) => i.id === itemId) ?? null;
  },
};
