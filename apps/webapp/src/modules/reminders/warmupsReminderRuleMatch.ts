import { DEFAULT_WARMUPS_SECTION_SLUG } from "@/modules/patient-home/warmupsSection";

/** Правило напоминания на раздел «Разминки» (канонический slug или legacy `warmups`). */
export function isWarmupsContentSectionReminderRule(
  rule: { linkedObjectType: string | null; linkedObjectId: string | null },
  warmupsSectionSlug: string,
): boolean {
  if (rule.linkedObjectType !== "content_section") return false;
  const id = rule.linkedObjectId?.trim() ?? "";
  if (!id) return false;
  const canonical = warmupsSectionSlug.trim();
  return id === canonical || id === DEFAULT_WARMUPS_SECTION_SLUG;
}
