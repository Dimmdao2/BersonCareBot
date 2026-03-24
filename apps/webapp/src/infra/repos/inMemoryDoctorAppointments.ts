import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentsFilter,
  DoctorAppointmentsPort,
  DoctorDashboardAppointmentMetrics,
} from "@/modules/doctor-appointments/ports";

export const inMemoryDoctorAppointmentsPort: DoctorAppointmentsPort = {
  async listAppointmentsForSpecialist(_filter: DoctorAppointmentsFilter): Promise<AppointmentRow[]> {
    return []; // branchName included in AppointmentRow when using pg port
  },
  async getAppointmentStats(_filter: DoctorAppointmentsFilter): Promise<AppointmentStats> {
    return {
      total: 0,
      cancellations: 0,
      cancellations30d: 0,
      reschedules: 0,
    };
  },
  async getDashboardAppointmentMetrics(): Promise<DoctorDashboardAppointmentMetrics> {
    return {
      futureActiveCount: 0,
      recordsInCalendarMonthTotal: 0,
      cancellationsInCalendarMonth: 0,
    };
  },
};
