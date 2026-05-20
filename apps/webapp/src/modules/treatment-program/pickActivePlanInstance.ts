import type { TreatmentProgramAssignmentSource, TreatmentProgramInstanceSummary } from "./types";

const PATIENT_HOME_PLAN_ASSIGNMENT_SOURCES = new Set<TreatmentProgramAssignmentSource>(["doctor", "course"]);

/**
 * Любой активный экземпляр (в т.ч. promo) — напоминания, go-цели, дневник.
 */
export function pickActivePlanInstance(
  instances: TreatmentProgramInstanceSummary[],
): TreatmentProgramInstanceSummary | null {
  const active = instances
    .filter((i) => i.status === "active")
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return active[0] ?? null;
}

/**
 * Карточка «Мой план реабилитации» на главной: только назначение врача или курс, без promo.
 */
export function pickActivePlanInstanceForPatientHome(
  instances: TreatmentProgramInstanceSummary[],
): TreatmentProgramInstanceSummary | null {
  const active = instances
    .filter(
      (i) => i.status === "active" && PATIENT_HOME_PLAN_ASSIGNMENT_SOURCES.has(i.assignmentSource),
    )
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  return active[0] ?? null;
}
