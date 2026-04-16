import type { ReferenceCategory, ReferenceItem } from "./types";

export type ReferencesPort = {
  listCategories(): Promise<ReferenceCategory[]>;
  listActiveItemsByCategoryCode(categoryCode: string): Promise<ReferenceItem[]>;
  listItemsForManagementByCategoryCode(categoryCode: string): Promise<ReferenceItem[]>;
  findCategoryByCode(categoryCode: string): Promise<ReferenceCategory | null>;
  insertItem(params: {
    categoryCode: string;
    code: string;
    title: string;
    metaJson?: Record<string, unknown>;
  }): Promise<ReferenceItem>;
  insertItemStaff(params: {
    categoryCode: string;
    code: string;
    title: string;
    sortOrder?: number;
    metaJson?: Record<string, unknown>;
  }): Promise<ReferenceItem>;
  updateItem(
    itemId: string,
    input: { title?: string; sortOrder?: number; isActive?: boolean }
  ): Promise<ReferenceItem>;
  saveCatalog(
    categoryCode: string,
    input: {
      updates: Array<{ id: string; title: string; sortOrder: number; isActive: boolean }>;
      additions: Array<{ code: string; title: string; sortOrder: number }>;
    }
  ): Promise<void>;
  archiveItem(itemId: string): Promise<void>;
  findItemById(itemId: string): Promise<ReferenceItem | null>;
};
