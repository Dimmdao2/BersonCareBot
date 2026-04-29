import type { PatientHomeBlockCode, PatientHomeBlockItemTargetType } from "./ports";

export const PATIENT_HOME_BLOCK_CODES = [
  "daily_warmup",
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

const blockTargetTypeMap: Record<PatientHomeBlockCode, readonly PatientHomeBlockItemTargetType[]> = {
  daily_warmup: ["content_page"],
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
