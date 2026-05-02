import type { TreatmentProgramTemplateUsageRef } from "@/modules/treatment-program/types";

export function doctorTreatmentProgramTemplateUsageHref(ref: TreatmentProgramTemplateUsageRef): string {
  switch (ref.kind) {
    case "treatment_program_instance":
      return `/app/doctor/clients/${encodeURIComponent(ref.patientUserId)}/treatment-programs/${encodeURIComponent(ref.id)}`;
    case "course":
      return `/app/doctor/courses/${encodeURIComponent(ref.id)}`;
    default: {
      const _x: never = ref;
      return _x;
    }
  }
}
