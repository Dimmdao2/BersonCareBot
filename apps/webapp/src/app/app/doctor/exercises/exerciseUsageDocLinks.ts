import type { ExerciseUsageRef } from "@/modules/lfk-exercises/types";

/** Канонические пути врача для ссылок из блока «Где используется» (упражнения). */
export function doctorExerciseUsageHref(ref: ExerciseUsageRef): string {
  switch (ref.kind) {
    case "lfk_complex_template":
      return `/app/doctor/lfk-templates/${encodeURIComponent(ref.id)}`;
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
