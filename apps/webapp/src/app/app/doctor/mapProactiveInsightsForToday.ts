import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";

export type TodayProactiveInsightItem = ProactiveInsightRow & {
  href: string;
};

export function proactiveInsightHref(row: ProactiveInsightRow): string {
  const uid = encodeURIComponent(row.patientUserId);
  if (row.kind === "wellbeing_low_streak") {
    return `/app/doctor/clients/${uid}#doctor-client-section-wellbeing`;
  }
  // program_inactivity and any future kinds → appointments tab, treatment program section
  return `/app/doctor/clients/${uid}?scope=appointments#doctor-client-section-treatment-programs`;
}

export function mapProactiveInsightsForToday(rows: readonly ProactiveInsightRow[]): TodayProactiveInsightItem[] {
  return rows.map((row) => ({
    ...row,
    href: proactiveInsightHref(row),
  }));
}
