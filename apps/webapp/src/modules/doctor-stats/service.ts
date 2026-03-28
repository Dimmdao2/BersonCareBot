/** Операционная статистика для кабинета специалиста. */
import type {
  DoctorAppointmentStatsFilter,
  DoctorDashboardAppointmentMetrics,
} from "@/modules/doctor-appointments/ports";
import type { DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";

export type DoctorStatsState = {
  appointments: {
    total: number;
    cancellations: number;
    cancellations30d: number;
    reschedules: number;
  };
  clients: {
    total: number;
    withNoChannels: number;
    withOneChannel: number;
    withMultipleChannels: number;
  };
};

/**
 * Плитки главной `/app/doctor` (этап 9).
 * Определения метрик: docs/ARCHITECTURE/DOCTOR_DASHBOARD_METRICS.md.
 */
export type DoctorDashboardMetrics = {
  patients: {
    total: number;
    onSupport: number;
    visitedThisMonth: number;
  };
  appointments: {
    futureActive: number;
    recordsInMonthTotal: number;
    cancellationsInMonth: number;
  };
};

export type DoctorStatsServiceDeps = {
  getAppointmentStats: (filter: DoctorAppointmentStatsFilter) => Promise<{
    total: number;
    cancellations: number;
    cancellations30d: number;
    reschedules: number;
  }>;
  listClients: (filters: { hasTelegram?: boolean; hasMax?: boolean }) => Promise<
    Array<{ userId: string; bindings: { telegramId?: string; maxId?: string } }>
  >;
  getDashboardPatientMetrics: () => Promise<DoctorDashboardPatientMetrics>;
  getDashboardAppointmentMetrics: () => Promise<DoctorDashboardAppointmentMetrics>;
};

export function createDoctorStatsService(deps: DoctorStatsServiceDeps) {
  return {
    async getStats(): Promise<DoctorStatsState> {
      const [appointmentStats, allClients] = await Promise.all([
        deps.getAppointmentStats({ range: "week" }),
        deps.listClients({}),
      ]);

      let withNoChannels = 0;
      let withOneChannel = 0;
      let withMultipleChannels = 0;
      for (const c of allClients) {
        const count = [c.bindings.telegramId, c.bindings.maxId].filter(Boolean).length;
        if (count === 0) withNoChannels++;
        else if (count === 1) withOneChannel++;
        else withMultipleChannels++;
      }

      return {
        appointments: {
          total: appointmentStats.total,
          cancellations: appointmentStats.cancellations,
          cancellations30d: appointmentStats.cancellations30d,
          reschedules: appointmentStats.reschedules,
        },
        clients: {
          total: allClients.length,
          withNoChannels,
          withOneChannel,
          withMultipleChannels,
        },
      };
    },

    async getDashboardMetrics(): Promise<DoctorDashboardMetrics> {
      const [p, a] = await Promise.all([
        deps.getDashboardPatientMetrics(),
        deps.getDashboardAppointmentMetrics(),
      ]);
      return {
        patients: {
          total: p.totalClients,
          onSupport: p.onSupportCount,
          visitedThisMonth: p.visitedThisCalendarMonthCount,
        },
        appointments: {
          futureActive: a.futureActiveCount,
          recordsInMonthTotal: a.recordsInCalendarMonthTotal,
          cancellationsInMonth: a.cancellationsInCalendarMonth,
        },
      };
    },
  };
}
