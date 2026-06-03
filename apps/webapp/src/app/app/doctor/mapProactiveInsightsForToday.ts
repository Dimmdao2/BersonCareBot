import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import {
  DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
  doctorClientProfileHref,
} from "./clients/doctorClientProfileHref";

export type TodayProactiveInsightItem = ProactiveInsightRow & {
  href: string;
};

const WELLBEING_ANCHOR = "doctor-client-section-wellbeing";

export function proactiveInsightHref(row: ProactiveInsightRow): string {
  if (row.kind === "wellbeing_low_streak") {
    return doctorClientProfileHref(row.patientUserId, { hash: WELLBEING_ANCHOR });
  }
  return doctorClientProfileHref(row.patientUserId, {
    profileListScope: "appointments",
    hash: DOCTOR_CLIENT_PROGRAM_SECTION_ANCHOR,
  });
}

export function mapProactiveInsightsForToday(rows: readonly ProactiveInsightRow[]): TodayProactiveInsightItem[] {
  return rows.map((row) => ({
    ...row,
    href: proactiveInsightHref(row),
  }));
}
