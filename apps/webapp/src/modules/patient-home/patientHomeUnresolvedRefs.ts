import type { PatientHomeBlock, PatientHomeBlockItem } from "./ports";

export type KnownPatientHomeRefs = {
  contentPages: string[];
  contentSections: string[];
  courses: string[];
};

export function isPatientHomeItemResolved(item: PatientHomeBlockItem, knownRefs: KnownPatientHomeRefs): boolean {
  if (item.targetType === "static_action") return true;
  if (item.targetType === "content_page") return knownRefs.contentPages.includes(item.targetRef);
  if (item.targetType === "content_section") return knownRefs.contentSections.includes(item.targetRef);
  return knownRefs.courses.includes(item.targetRef);
}

export function listUnresolvedPatientHomeBlockItems(
  block: PatientHomeBlock,
  knownRefs: KnownPatientHomeRefs,
): PatientHomeBlockItem[] {
  return block.items.filter((item) => !isPatientHomeItemResolved(item, knownRefs));
}

/** Для UI: битые ссылки у видимых vs только у скрытых элементов блока. */
export function partitionUnresolvedPatientHomeItemsByVisibility(
  unresolved: PatientHomeBlockItem[],
): { visible: PatientHomeBlockItem[]; hidden: PatientHomeBlockItem[] } {
  return {
    visible: unresolved.filter((item) => item.isVisible),
    hidden: unresolved.filter((item) => !item.isVisible),
  };
}

/** Slug для query `suggestedSlug` (только латиница/цифры/дефис, не только дефисы). */
export function suggestedSlugForNewContentSection(raw: string): string | null {
  const s = raw.trim().toLowerCase();
  if (!s || !/^[a-z0-9-]+$/.test(s) || /^-+$/.test(s)) return null;
  return s;
}
