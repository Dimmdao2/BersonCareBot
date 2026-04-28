import type { PatientHomeBlock, PatientHomeBlockCode } from "./ports";

const PERSONAL_BLOCK_CODES = new Set<PatientHomeBlockCode>([
  "progress",
  "mood_checkin",
  "next_reminder",
  "plan",
]);

/** Блоки с персональными данными / tier patient — скрывать при `personalTierOk === false` (README §3.2). */
export function isPatientHomePersonalBlock(code: PatientHomeBlockCode): boolean {
  return PERSONAL_BLOCK_CODES.has(code);
}

export function shouldRenderPatientHomeBlock(code: PatientHomeBlockCode, personalTierOk: boolean): boolean {
  if (!personalTierOk && isPatientHomePersonalBlock(code)) return false;
  return true;
}

/** Видимые блоки главной в порядке `sortOrder` с учётом сессии. */
export function filterAndSortPatientHomeBlocks(
  blocks: PatientHomeBlock[],
  personalTierOk: boolean,
): PatientHomeBlock[] {
  return [...blocks]
    .filter((b) => b.isVisible)
    .filter((b) => shouldRenderPatientHomeBlock(b.code, personalTierOk))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.code.localeCompare(b.code));
}
