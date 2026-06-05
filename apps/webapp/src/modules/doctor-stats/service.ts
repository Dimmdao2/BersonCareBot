/** Операционная статистика для кабинета специалиста. */
import type {
  DoctorAppointmentStatsFilter,
  DoctorDashboardAppointmentMetrics,
} from "@/modules/doctor-appointments/ports";
import type { AnalyticsAudienceContext } from "@/modules/analytics/analyticsAudience";
import type { ClientContactBreakdown } from "@/modules/doctor-clients/clientContactSegments";
import type { DoctorDashboardPatientMetrics } from "@/modules/doctor-clients/ports";

export type DoctorStatsState = {
  appointments: {
    pastVisitsInPeriod: number;
    cancelledVisitsInPeriod: number;
    bookingsCreatedInPeriod: number;
    cancellationActionsInPeriod: number;
    rescheduleActionsInPeriod: number;
    total: number;
    cancellations30d: number;
  };
  clients: {
    total: number;
    phoneOnly: number;
    appGuests: number;
    contactBreakdown: ClientContactBreakdown;
    /** Созданы за последние 7 суток, без telegram/max (KPI «Сегодня»). */
    newClients7dWithNoChannels: number;
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

type AudienceArg = { excludedUserIds?: string[] };

export type DoctorStatsServiceDeps = {
  getAppointmentStats: (
    filter: DoctorAppointmentStatsFilter,
    audience?: AudienceArg,
  ) => Promise<{
    pastVisitsInPeriod: number;
    cancelledVisitsInPeriod: number;
    bookingsCreatedInPeriod: number;
    cancellationActionsInPeriod: number;
    rescheduleActionsInPeriod: number;
    total: number;
    cancellations30d: number;
  }>;
  getClientContactBreakdown: (audience?: AudienceArg) => Promise<ClientContactBreakdown>;
  getDashboardPatientMetrics: (audience?: AudienceArg) => Promise<DoctorDashboardPatientMetrics>;
  getDashboardAppointmentMetrics: (audience?: AudienceArg) => Promise<DoctorDashboardAppointmentMetrics>;
  countRecentClientsWithoutMessagingChannels: (days: number, audience?: AudienceArg) => Promise<number>;
};

export function createDoctorStatsService(deps: DoctorStatsServiceDeps) {
  return {
    async getStats(audience: AnalyticsAudienceContext): Promise<DoctorStatsState> {
      const aud = { excludedUserIds: audience.excludedUserIds };
      const [appointmentStats, contactBreakdown, newClients7dWithNoChannels] = await Promise.all([
        deps.getAppointmentStats({ kind: "range", range: "week" }, aud),
        deps.getClientContactBreakdown(aud),
        deps.countRecentClientsWithoutMessagingChannels(7, aud),
      ]);

      return {
        appointments: {
          pastVisitsInPeriod: appointmentStats.pastVisitsInPeriod,
          cancelledVisitsInPeriod: appointmentStats.cancelledVisitsInPeriod,
          bookingsCreatedInPeriod: appointmentStats.bookingsCreatedInPeriod,
          cancellationActionsInPeriod: appointmentStats.cancellationActionsInPeriod,
          rescheduleActionsInPeriod: appointmentStats.rescheduleActionsInPeriod,
          total: appointmentStats.total,
          cancellations30d: appointmentStats.cancellations30d,
        },
        clients: {
          total: contactBreakdown.total,
          phoneOnly: contactBreakdown.phoneOnly,
          appGuests: contactBreakdown.appGuests,
          contactBreakdown,
          newClients7dWithNoChannels,
        },
      };
    },

    async getDashboardMetrics(audience: AnalyticsAudienceContext): Promise<DoctorDashboardMetrics> {
      const aud = { excludedUserIds: audience.excludedUserIds };
      const [p, a] = await Promise.all([
        deps.getDashboardPatientMetrics(aud),
        deps.getDashboardAppointmentMetrics(aud),
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
