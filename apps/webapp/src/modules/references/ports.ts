import type { ReferenceCategory, ReferenceItem } from "./types";

export type ReferencesPort = {
  listActiveItemsByCategoryCode(categoryCode: string): Promise<ReferenceItem[]>;
  findCategoryByCode(categoryCode: string): Promise<ReferenceCategory | null>;
  insertItem(params: {
    categoryCode: string;
    code: string;
    title: string;
    metaJson?: Record<string, unknown>;
  }): Promise<ReferenceItem>;
  archiveItem(itemId: string): Promise<void>;
  findItemById(itemId: string): Promise<ReferenceItem | null>;
};
