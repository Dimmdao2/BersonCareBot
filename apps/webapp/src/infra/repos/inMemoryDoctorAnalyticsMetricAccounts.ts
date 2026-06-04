import type { DoctorAnalyticsMetricAccountsPort } from "@/modules/doctor-analytics-metric-accounts/ports";

export const inMemoryDoctorAnalyticsMetricAccountsPort: DoctorAnalyticsMetricAccountsPort = {
  async listMetricAccounts({ offset }) {
    return {
      items: [],
      hasMore: false,
      nextOffset: offset > 0 ? offset : null,
    };
  },
};
