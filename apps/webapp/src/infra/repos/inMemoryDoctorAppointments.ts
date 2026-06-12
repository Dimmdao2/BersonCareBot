import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
  ScheduleKpis,
  ScheduleKpisQuery,
} from "@/modules/doctor-appointments/ports";

export const inMemoryDoctorAppointmentsPort: DoctorAppointmentsPort = {
  async listAppointmentsForSpecialist(
    _filter: DoctorAppointmentsListFilter,
    _audience?: { excludedUserIds?: string[] },
  ): Promise<AppointmentRow[]> {
    return []; // branchName included in AppointmentRow when using pg port
  },
  async getAppointmentStats(
    _filter: DoctorAppointmentStatsFilter,
    _audience?: { excludedUserIds?: string[] },
  ): Promise<AppointmentStats> {
    return {
      pastVisitsInPeriod: 0,
      cancelledVisitsInPeriod: 0,
      bookingsCreatedInPeriod: 0,
      cancellationActionsInPeriod: 0,
      rescheduleActionsInPeriod: 0,
      total: 0,
      cancellations30d: 0,
    };
  },
  async getDashboardAppointmentMetrics(
    _audience?: { excludedUserIds?: string[] },
  ): Promise<DoctorDashboardAppointmentMetrics> {
    return {
      futureActiveCount: 0,
      recordsInCalendarMonthTotal: 0,
      cancellationsInCalendarMonth: 0,
    };
  },
  async getScheduleKpis(
    _query: ScheduleKpisQuery,
    _audience?: { excludedUserIds?: string[] },
  ): Promise<ScheduleKpis> {
    // Stub: no in-memory appointment dataset; returns zeros for all 9 KPI.
    // Real KPIs come from pgDoctorCanonicalAppointments.
    return {
      recordsInPeriod: 0,
      pastInPeriod: 0,
      futureInPeriod: 0,
      bySubscriptionInPeriod: 0,
      firstVisitInPeriod: 0,
      repeatVisitInPeriod: 0,
      uniquePatientsInPeriod: 0,
      cancellationsInPeriod: 0,
      reschedulesInPeriod: 0,
    };
  },
};
