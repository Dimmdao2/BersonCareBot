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
  {
    id: "rc-clinical_assessment_kind",
    code: "clinical_assessment_kind",
    title: "Виды оценки (клинические тесты)",
    isUserExtensible: false,
    tenantId: null,
  },
  {
    id: "rc-recommendation_type",
    code: "recommendation_type",
    title: "Типы рекомендаций",
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
  {
    id: "ri-ak-mobility",
    categoryId: "rc-clinical_assessment_kind",
    code: "mobility",
    title: "Подвижность",
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-pain",
    categoryId: "rc-clinical_assessment_kind",
    code: "pain",
    title: "Болезненность",
    sortOrder: 2,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-sensitivity",
    categoryId: "rc-clinical_assessment_kind",
    code: "sensitivity",
    title: "Чувствительность",
    sortOrder: 3,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-strength",
    categoryId: "rc-clinical_assessment_kind",
    code: "strength",
    title: "Сила",
    sortOrder: 4,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-neurodynamics",
    categoryId: "rc-clinical_assessment_kind",
    code: "neurodynamics",
    title: "Нейродинамика",
    sortOrder: 5,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-proprioception",
    categoryId: "rc-clinical_assessment_kind",
    code: "proprioception",
    title: "Проприоцепция",
    sortOrder: 6,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-balance",
    categoryId: "rc-clinical_assessment_kind",
    code: "balance",
    title: "Равновесие",
    sortOrder: 7,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-ak-endurance",
    categoryId: "rc-clinical_assessment_kind",
    code: "endurance",
    title: "Выносливость",
    sortOrder: 8,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-exercise_technique",
    categoryId: "rc-recommendation_type",
    code: "exercise_technique",
    title: "Техника упражнений",
    sortOrder: 1,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-regimen",
    categoryId: "rc-recommendation_type",
    code: "regimen",
    title: "Режим / график",
    sortOrder: 2,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-nutrition",
    categoryId: "rc-recommendation_type",
    code: "nutrition",
    title: "Питание",
    sortOrder: 3,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-device",
    categoryId: "rc-recommendation_type",
    code: "device",
    title: "Устройство / аппарат",
    sortOrder: 4,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-self_procedure",
    categoryId: "rc-recommendation_type",
    code: "self_procedure",
    title: "Самостоятельная процедура",
    sortOrder: 5,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-external_therapy",
    categoryId: "rc-recommendation_type",
    code: "external_therapy",
    title: "Внешняя терапия",
    sortOrder: 6,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-lifestyle",
    categoryId: "rc-recommendation_type",
    code: "lifestyle",
    title: "Образ жизни",
    sortOrder: 7,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-daily_activity",
    categoryId: "rc-recommendation_type",
    code: "daily_activity",
    title: "Бытовая активность",
    sortOrder: 8,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-physiotherapy",
    categoryId: "rc-recommendation_type",
    code: "physiotherapy",
    title: "Физиотерапия",
    sortOrder: 9,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-motivation",
    categoryId: "rc-recommendation_type",
    code: "motivation",
    title: "Мотивация",
    sortOrder: 10,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
  {
    id: "ri-rt-safety",
    categoryId: "rc-recommendation_type",
    code: "safety",
    title: "Техника безопасности",
    sortOrder: 11,
    isActive: true,
    deletedAt: null,
    metaJson: {},
  },
];

function throwDuplicateCode(conflictingCodes: string[]): never {
  const err = new Error("duplicate_code") as Error & { conflictingCodes: string[] };
  err.conflictingCodes = conflictingCodes;
  throw err;
}

function ensureUniqueCode(categoryId: string, code: string): void {
  if (
    items.some(
      (i) => i.categoryId === categoryId && i.code === code && i.deletedAt == null
    )
  ) {
    throwDuplicateCode([code]);
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
    const updateNormCodes = input.updates.map((u) => u.code.trim().toLowerCase());
    const additionNormCodes = input.additions.map((a) => a.code.trim().toLowerCase());
    const allNormCodes = [...updateNormCodes, ...additionNormCodes];
    const batchCounts = new Map<string, number>();
    for (const c of allNormCodes) {
      batchCounts.set(c, (batchCounts.get(c) ?? 0) + 1);
    }
    const duplicateInBatch = [...batchCounts.entries()].filter(([, n]) => n > 1).map(([c]) => c);
    if (duplicateInBatch.length > 0) {
      throwDuplicateCode(duplicateInBatch);
    }

    const idsNeedingTemp: string[] = [];
    for (const update of input.updates) {
      const item = items.find((i) => i.id === update.id && i.categoryId === cat.id && i.deletedAt == null);
      if (!item) throw new Error("item_not_found");
      const newCode = update.code.trim().toLowerCase();
      if (item.code.trim().toLowerCase() !== newCode) {
        idsNeedingTemp.push(item.id);
      }
    }
    for (const id of idsNeedingTemp) {
      const item = items.find((i) => i.id === id);
      if (item) item.code = `__tmpref${id.replace(/-/g, "")}`;
    }

    for (const update of input.updates) {
      const item = items.find((i) => i.id === update.id && i.categoryId === cat.id && i.deletedAt == null);
      if (!item) throw new Error("item_not_found");
      item.title = update.title;
      item.sortOrder = update.sortOrder;
      item.isActive = update.isActive;
      item.code = update.code.trim().toLowerCase();
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
