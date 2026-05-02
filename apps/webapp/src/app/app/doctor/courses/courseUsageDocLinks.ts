import type { CourseUsageRef } from "@/modules/courses/types";

export function doctorCourseUsageHref(ref: CourseUsageRef): string {
  switch (ref.kind) {
    case "treatment_program_template":
      return `/app/doctor/treatment-program-templates/${encodeURIComponent(ref.id)}`;
    case "treatment_program_instance":
      return `/app/doctor/clients/${encodeURIComponent(ref.patientUserId)}/treatment-programs/${encodeURIComponent(ref.id)}`;
    case "content_page":
      return `/app/doctor/content/edit/${encodeURIComponent(ref.id)}`;
    default: {
      const _x: never = ref;
      return _x;
    }
  }
}
