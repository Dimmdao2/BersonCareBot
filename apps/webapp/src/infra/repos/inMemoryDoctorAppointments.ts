import type {
  AppointmentRow,
  AppointmentStats,
  DoctorAppointmentsFilter,
  DoctorAppointmentsPort,
} from "@/modules/doctor-appointments/ports";

export const inMemoryDoctorAppointmentsPort: DoctorAppointmentsPort = {
  async listAppointmentsForSpecialist(_filter: DoctorAppointmentsFilter): Promise<AppointmentRow[]> {
    return [];
  },
  async getAppointmentStats(_filter: DoctorAppointmentsFilter): Promise<AppointmentStats> {
    return {
      total: 0,
      cancellations: 0,
      cancellations30d: 0,
      reschedules: 0,
    };
  },
};
