import type { LfkTemplateUsageRef } from "@/modules/lfk-templates/types";

/** Канонические пути врача для ссылок из блока «Где используется» (комплексы ЛФК). */
export function doctorLfkTemplateUsageHref(ref: LfkTemplateUsageRef): string {
  switch (ref.kind) {
    case "treatment_program_template":
      return `/app/doctor/treatment-program-templates/${encodeURIComponent(ref.id)}`;
    case "treatment_program_instance":
      return `/app/doctor/clients/${encodeURIComponent(ref.patientUserId)}/treatment-programs/${encodeURIComponent(ref.id)}`;
    case "patient_lfk_assignment_client":
      return `/app/doctor/clients/${encodeURIComponent(ref.patientUserId)}`;
    default: {
      const _x: never = ref;
      return _x;
    }
  }
}
