import type { TreatmentProgramInstanceSummary } from "./types";

/**
 * Выбор экземпляра программы для карточки «План» на главной и для дневника.
 * Совпадает с прежней логикой в `PatientHomeToday.tsx`.
 */
export function pickActivePlanInstance(
  instances: TreatmentProgramInstanceSummary[],
): TreatmentProgramInstanceSummary | null {
  const active = instances
    .filter((i) => i.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return active[0] ?? null;
}
