import type { ProactiveInsightKind, ProactiveInsightRow } from "./types";

export type DoctorProactiveInsightsQueryResult = {
  items: ProactiveInsightRow[];
  totalCount: number;
};

export type DoctorProactiveInsightsPort = {
  queryInsights(params: {
    limit: number;
    displayIana: string;
    organizationId: string;
    /** Optional exact allow-list for configurable Today visibility. */
    kinds?: readonly ProactiveInsightKind[];
  }): Promise<DoctorProactiveInsightsQueryResult>;
  listForPatient(params: {
    patientUserId: string;
    displayIana: string;
    organizationId: string;
  }): Promise<ProactiveInsightRow[]>;
};
