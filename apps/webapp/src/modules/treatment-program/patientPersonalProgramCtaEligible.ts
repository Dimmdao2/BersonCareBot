import type { TreatmentProgramAssignmentSource } from "./types";

/** CTA «персональная программа»: показываем только при назначении не врачом (промо, курс/запись на курс). */
export function patientPersonalProgramCtaEligible(source: TreatmentProgramAssignmentSource): boolean {
  return source === "promo" || source === "course";
}

/** Видимость CTA для экрана плана: в **production** — как {@link patientPersonalProgramCtaEligible}; иначе (`next dev`, Vitest…) — всегда, чтобы блок не терялся на врачебных тестовых экземплярах. */
export function patientPersonalProgramCtaShouldRender(source: TreatmentProgramAssignmentSource): boolean {
  if (process.env.NODE_ENV !== "production") return true;
  return patientPersonalProgramCtaEligible(source);
}
