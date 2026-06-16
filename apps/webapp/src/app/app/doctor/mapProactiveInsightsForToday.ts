import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";
import { patientCardHref } from "./patients/patientCardHref";

export type TodayProactiveInsightItem = ProactiveInsightRow & {
  href: string;
};

export function proactiveInsightHref(row: ProactiveInsightRow): string {
  return patientCardHref(row.patientUserId);
}

export function mapProactiveInsightsForToday(rows: readonly ProactiveInsightRow[]): TodayProactiveInsightItem[] {
  return rows.map((row) => ({
    ...row,
    href: proactiveInsightHref(row),
  }));
}
