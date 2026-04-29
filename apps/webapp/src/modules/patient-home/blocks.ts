/** CMS-блоки главной пациента (`patient_home_blocks.code`) — целевая модель инициативы. */
export const PATIENT_HOME_CMS_BLOCK_CODES = [
  "situations",
  "daily_warmup",
  "subscription_carousel",
  "sos",
  "courses",
] as const;

export type PatientHomeCmsBlockCode = (typeof PATIENT_HOME_CMS_BLOCK_CODES)[number];

/**
 * Системные зоны главной без списка `patient_home_block_items` (данные из других подсистем).
 * Используются в админ-превью для пояснения «не настраивается списком».
 */
export const PATIENT_HOME_SYSTEM_BLOCK_CODES = ["lfk_progress", "next_reminder", "mood_checkin"] as const;

export type PatientHomeSystemBlockCode = (typeof PATIENT_HOME_SYSTEM_BLOCK_CODES)[number];

export type PatientHomeBlockCode = PatientHomeCmsBlockCode | PatientHomeSystemBlockCode;

export type PatientHomeBlockItemTargetType = "content_section" | "content_page" | "course";

export function isPatientHomeCmsBlockCode(code: string): code is PatientHomeCmsBlockCode {
  return (PATIENT_HOME_CMS_BLOCK_CODES as readonly string[]).includes(code);
}

export function patientHomeBlockRequiresItemList(code: string): code is PatientHomeCmsBlockCode {
  return isPatientHomeCmsBlockCode(code);
}

/** Блоки, в которых элементы могут ссылаться на `content_section` (inline-create раздела — Phase 3). */
const CMS_BLOCKS_ALLOWING_CONTENT_SECTION = ["situations", "subscription_carousel", "sos"] as const satisfies readonly PatientHomeCmsBlockCode[];

export function patientHomeCmsBlockAllowsContentSection(code: PatientHomeCmsBlockCode): boolean {
  return (CMS_BLOCKS_ALLOWING_CONTENT_SECTION as readonly string[]).includes(code);
}
