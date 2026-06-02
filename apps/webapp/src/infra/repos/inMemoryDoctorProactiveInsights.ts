import type { DoctorProactiveInsightsPort } from "@/modules/doctor-proactive-insights/ports";

/** In-memory stub: проактивная лента не эмулируется в dev in-memory режиме. */
export function createInMemoryDoctorProactiveInsightsPort(): DoctorProactiveInsightsPort {
  return {
    async queryInsights() {
      return { items: [], totalCount: 0 };
    },
    async listForPatient() {
      return [];
    },
  };
}
