import type { ClinicalTestUsageRef } from "@/modules/tests/types";

/** Канонические пути врача для ссылок из блока «Где используется» (клинические тесты). */
export function doctorClinicalTestUsageHref(ref: ClinicalTestUsageRef): string {
  switch (ref.kind) {
    case "test_set":
      return `/app/doctor/test-sets/${encodeURIComponent(ref.id)}`;
    case "treatment_program_template":
      return `/app/doctor/treatment-program-templates/${encodeURIComponent(ref.id)}`;
    case "treatment_program_instance":
      return `/app/doctor/clients/${encodeURIComponent(ref.patientUserId)}/treatment-programs/${encodeURIComponent(ref.id)}`;
    default: {
      const _x: never = ref;
      return _x;
    }
  }
}
