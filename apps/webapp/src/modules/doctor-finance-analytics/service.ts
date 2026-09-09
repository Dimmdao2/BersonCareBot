import type { DoctorFinanceAnalyticsPort } from './ports';

export function createDoctorFinanceAnalyticsService(port: DoctorFinanceAnalyticsPort) {
  return {
    getFinanceAnalytics: port.getFinanceAnalytics.bind(port),
  };
}

export type DoctorFinanceAnalyticsService = ReturnType<typeof createDoctorFinanceAnalyticsService>;
