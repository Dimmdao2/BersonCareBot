import type { PatientHomeBlock, PatientHomeBlockCode } from "./ports";

const PERSONAL_BLOCK_CODES = new Set<PatientHomeBlockCode>([
  "progress",
  "mood_checkin",
  "next_reminder",
  "plan",
]);

/** Блоки с персональными данными / gated drilldown (политика UI и ссылок, не скрытие с главной). */
export function isPatientHomePersonalBlock(code: PatientHomeBlockCode): boolean {
  return PERSONAL_BLOCK_CODES.has(code);
}

/** Видимые блоки главной в порядке `sortOrder` (видимость только из CMS: `isVisible` + порядок). */
export function filterAndSortPatientHomeBlocks(blocks: PatientHomeBlock[]): PatientHomeBlock[] {
  return [...blocks]
    .filter((b) => b.isVisible)
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}
