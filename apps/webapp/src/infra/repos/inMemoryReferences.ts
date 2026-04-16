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
    metaJson: {},
  },
  {
    id: "ri-neck",
    categoryId: "rc-body_region",
    code: "neck",
    title: "Шея",
    sortOrder: 1,
    isActive: true,
    metaJson: {},
  },
];

function ensureUniqueCode(categoryId: string, code: string): void {
  if (items.some((i) => i.categoryId === categoryId && i.code === code)) {
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
      .filter((i) => i.categoryId === cat.id && i.isActive)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.title.localeCompare(b.title));
  },

  async listItemsForManagementByCategoryCode(categoryCode) {
    const cat = await this.findCategoryByCode(categoryCode);
    if (!cat) return [];
    return items
      .filter((i) => i.categoryId === cat.id)
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
      metaJson: params.metaJson ?? {},
    };
    items.push(item);
    return item;
  },

  async updateItem(itemId, input) {
    const item = items.find((i) => i.id === itemId);
    if (!item) throw new Error("item_not_found");
    if (input.title !== undefined) item.title = input.title;
    if (input.sortOrder !== undefined) item.sortOrder = input.sortOrder;
    if (input.isActive !== undefined) item.isActive = input.isActive;
    return item;
  },

  async archiveItem(itemId) {
    const i = items.find((x) => x.id === itemId);
    if (i) i.isActive = false;
  },

  async findItemById(itemId) {
    return items.find((i) => i.id === itemId) ?? null;
  },
};
