import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentStatsFilter,
  DoctorAppointmentsListFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
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
};
