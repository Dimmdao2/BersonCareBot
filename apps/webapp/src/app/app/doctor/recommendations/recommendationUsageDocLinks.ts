import type { RecommendationUsageRef } from "@/modules/recommendations/types";

/** Канонические пути врача для ссылок из блока «Где используется» (рекомендации). */
export function doctorRecommendationUsageHref(ref: RecommendationUsageRef): string {
  switch (ref.kind) {
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
