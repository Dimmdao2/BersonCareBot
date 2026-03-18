import type { DoctorAppointmentsPort } from "./ports";

export type DoctorAppointmentsServiceDeps = {
  appointmentsPort: DoctorAppointmentsPort;
};

export function createDoctorAppointmentsService(deps: DoctorAppointmentsServiceDeps) {
  return {
    async listAppointmentsForSpecialist(filter: Parameters<DoctorAppointmentsPort["listAppointmentsForSpecialist"]>[0]) {
      return deps.appointmentsPort.listAppointmentsForSpecialist(filter);
    },
    async getAppointmentStats(filter: Parameters<DoctorAppointmentsPort["getAppointmentStats"]>[0]) {
      return deps.appointmentsPort.getAppointmentStats(filter);
    },
  };
}
