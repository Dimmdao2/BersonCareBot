import type { TreatmentProgramAssignmentSource, TreatmentProgramInstanceStatus } from "./types";

/** CTA «персональная программа»: показываем только при назначении не врачом (промо, курс/запись на курс). */
export function patientPersonalProgramCtaEligible(source: TreatmentProgramAssignmentSource): boolean {
  return source === "promo" || source === "course";
}

export function patientPersonalProgramCtaShouldRender(source: TreatmentProgramAssignmentSource): boolean {
  return patientPersonalProgramCtaEligible(source);
}

/** CTA «Консультация» на экране плана: active promo/course + завершённая врачебная программа. */
export function patientPersonalProgramCtaShouldRenderOnPlanScreen(input: {
  status: TreatmentProgramInstanceStatus;
  assignmentSource: TreatmentProgramAssignmentSource;
}): boolean {
  if (input.status === "completed" && input.assignmentSource === "doctor") {
    return true;
  }
  if (input.status === "active") {
    return patientPersonalProgramCtaShouldRender(input.assignmentSource);
  }
  return false;
}
