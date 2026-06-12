import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
  ScheduleKpis,
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
    _filter: DoctorAppointmentStatsFilter,
    _audience?: { excludedUserIds?: string[] },
  ): Promise<ScheduleKpis> {
    // -stub: no in-memory appointment dataset to compute KPIs from.
    // The in-memory port exists only for unit tests and local dev; real KPIs come from
    // pgDoctorCanonicalAppointments. This stub intentionally returns zeros — never 0-match-paritied.
    return {
      recordsInPeriod: 0,
      uniquePatientsInPeriod: 0,
      newPatientsInPeriod: 0,
      cancellationsInPeriod: 0,
      reschedulesInPeriod: 0,
    };
  },
};
