import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import { doctorClientTreatmentProgramInstanceHref } from "./clients/doctorClientInstanceHref";

export type TodayProactiveInsightItem = ProactiveInsightRow & {
  href: string;
};

const WELLBEING_ANCHOR = "doctor-client-section-wellbeing";
const PROGRAM_SECTION_ANCHOR = "doctor-client-section-treatment-programs";

export function proactiveInsightHref(row: ProactiveInsightRow): string {
  const base = `/app/doctor/clients/${encodeURIComponent(row.patientUserId)}`;
  if (row.kind === "wellbeing_low_streak") {
    return `${base}#${WELLBEING_ANCHOR}`;
  }
  if (row.kind === "program_inactivity" && row.activeProgramInstanceId) {
    return doctorClientTreatmentProgramInstanceHref(row.patientUserId, row.activeProgramInstanceId);
  }
  return `${base}#${PROGRAM_SECTION_ANCHOR}`;
}

export function mapProactiveInsightsForToday(rows: readonly ProactiveInsightRow[]): TodayProactiveInsightItem[] {
  return rows.map((row) => ({
    ...row,
    href: proactiveInsightHref(row),
  }));
}
