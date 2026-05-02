import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "./ports";
import type { ContentSectionKind, SystemParentCode } from "@/modules/content-sections/types";

export const PATIENT_HOME_BLOCK_CODES = [
  "daily_warmup",
  "useful_post",
  "booking",
  "situations",
  "progress",
  "next_reminder",
  "mood_checkin",
  "sos",
  "plan",
  "subscription_carousel",
  "courses",
] as const satisfies readonly PatientHomeBlockCode[];

export const PATIENT_HOME_ITEM_LIST_BLOCKS = [
  "daily_warmup",
  "useful_post",
  "situations",
  "subscription_carousel",
  "courses",
  "sos",
] as const satisfies readonly PatientHomeBlockCode[];

/**
 * Alias для PATIENT_HOME_ITEM_LIST_BLOCKS под именем, которое используют CMS-workflow ссылки
 * (Phase 5 PATIENT_HOME_CMS_WORKFLOW_INITIATIVE — return URL builders, candidate picker).
 */
export const PATIENT_HOME_CMS_BLOCK_CODES = PATIENT_HOME_ITEM_LIST_BLOCKS;
export type PatientHomeCmsBlockCode = (typeof PATIENT_HOME_ITEM_LIST_BLOCKS)[number];

/** Blocks whose home card uses a single leading icon configurable from CMS media. */
export const PATIENT_HOME_LEADING_ICON_BLOCK_CODES = [
  "sos",
  "next_reminder",
  "booking",
  "progress",
  "plan",
] as const satisfies readonly PatientHomeBlockCode[];

export type PatientHomeLeadingIconBlockCode = (typeof PATIENT_HOME_LEADING_ICON_BLOCK_CODES)[number];

export function supportsConfigurablePatientHomeBlockIcon(code: PatientHomeBlockCode): boolean {
  return (PATIENT_HOME_LEADING_ICON_BLOCK_CODES as readonly string[]).includes(code);
}

const blockTargetTypeMap: Record<PatientHomeBlockCode, readonly PatientHomeBlockItemTargetType[]> = {
  daily_warmup: ["content_page"],
  useful_post: ["content_page"],
  booking: [],
  situations: ["content_section"],
  progress: [],
  next_reminder: [],
  mood_checkin: [],
  sos: ["content_section", "content_page"],
  plan: [],
  subscription_carousel: ["content_section", "content_page", "course"],
  courses: ["course"],
};

export function isPatientHomeBlockCode(value: string): value is PatientHomeBlockCode {
  return (PATIENT_HOME_BLOCK_CODES as readonly string[]).includes(value);
}

export function canManageItemsForBlock(code: PatientHomeBlockCode): boolean {
  return (PATIENT_HOME_ITEM_LIST_BLOCKS as readonly string[]).includes(code);
}

export function allowedTargetTypesForBlock(code: PatientHomeBlockCode): readonly PatientHomeBlockItemTargetType[] {
  return blockTargetTypeMap[code];
}

export function isTargetTypeAllowedForBlock(
  code: PatientHomeBlockCode,
  targetType: PatientHomeBlockItemTargetType,
): boolean {
  return allowedTargetTypesForBlock(code).includes(targetType);
}

/** Section taxonomy fields needed for patient-home CMS candidate / validation rules. */
export type PatientHomeSectionTaxonomyPick = {
  kind: ContentSectionKind;
  systemParentCode: SystemParentCode | null;
};

/** Page fields needed for patient-home CMS candidate / validation rules. */
export type PatientHomePagePickForRules = {
  slug: string;
  section: string;
  isPublished: boolean;
  archivedAt: string | null;
  deletedAt: string | null;
};

/**
 * Whether a `content_sections` row may appear in the picker / be saved as a target for this home block.
 * `subscription_carousel` keeps a permissive list (no extra taxonomy filter in this pass).
 */
export function isPatientHomeContentSectionCandidateForBlock(
  blockCode: PatientHomeBlockCode,
  section: PatientHomeSectionTaxonomyPick,
): boolean {
  if (blockCode === "situations") {
    return section.kind === "system" && section.systemParentCode === "situations";
  }
  if (blockCode === "sos") {
    return section.kind === "system" && section.systemParentCode === "sos";
  }
  if (blockCode === "subscription_carousel") {
    return true;
  }
  return false;
}

/**
 * Whether a `content_pages` row may appear in the picker / be saved as a target for this home block.
 * Uses the page's `section` slug to resolve parent section taxonomy.
 */
export function isPatientHomeContentPageCandidateForBlock(
  blockCode: PatientHomeBlockCode,
  page: PatientHomePagePickForRules,
  sectionBySlug: ReadonlyMap<string, PatientHomeSectionTaxonomyPick>,
): boolean {
  const sec = sectionBySlug.get(page.section);
  if (!sec) return false;

  if (blockCode === "useful_post") {
    if (!page.isPublished || page.archivedAt != null || page.deletedAt != null) return false;
    return sec.kind === "article";
  }
  if (blockCode === "daily_warmup") {
    if (!page.isPublished || page.archivedAt != null || page.deletedAt != null) return false;
    return sec.kind === "system" && sec.systemParentCode === "warmups";
  }
  if (blockCode === "sos") {
    if (!page.isPublished || page.archivedAt != null || page.deletedAt != null) return false;
    return sec.kind === "system" && sec.systemParentCode === "sos";
  }
  if (blockCode === "subscription_carousel") {
    return true;
  }
  return false;
}
