import type { ProactiveInsightRow } from "./types";

export type DoctorProactiveInsightsQueryResult = {
  items: ProactiveInsightRow[];
  totalCount: number;
};

export type DoctorProactiveInsightsPort = {
  queryInsights(params: { limit: number; displayIana: string }): Promise<DoctorProactiveInsightsQueryResult>;
  listForPatient(params: { patientUserId: string; displayIana: string }): Promise<ProactiveInsightRow[]>;
};
