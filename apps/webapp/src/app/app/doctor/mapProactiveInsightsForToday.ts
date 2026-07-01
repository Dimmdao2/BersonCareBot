import { patientCardHref } from "./patients/patientCardHref";
import type { ProactiveInsightRow } from "@/modules/doctor-proactive-insights/types";

export type TodayProactiveInsightItem = ProactiveInsightRow & {
  href: string;
};

export function proactiveInsightHref(row: ProactiveInsightRow): string {
  // New patient card. (Regression fix: 90aa7f32 — a test-greening commit — had reverted
  // these links back to the OLD /clients/ ClientProfileCard; restored to 968db341's intent.)
  return patientCardHref(row.patientUserId);
}

export function mapProactiveInsightsForToday(rows: readonly ProactiveInsightRow[]): TodayProactiveInsightItem[] {
  return rows.map((row) => ({
    ...row,
    href: proactiveInsightHref(row),
  }));
}
