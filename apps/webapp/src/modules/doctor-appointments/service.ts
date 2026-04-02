import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { formatDoctorAppointmentRecordAt } from "@/shared/lib/formatBusinessDateTime";
import type { DoctorAppointmentsPort } from "./ports";

export type DoctorAppointmentsServiceDeps = {
  appointmentsPort: DoctorAppointmentsPort;
};

export function createDoctorAppointmentsService(deps: DoctorAppointmentsServiceDeps) {
  return {
    async listAppointmentsForSpecialist(filter: Parameters<DoctorAppointmentsPort["listAppointmentsForSpecialist"]>[0]) {
      const rows = await deps.appointmentsPort.listAppointmentsForSpecialist(filter);
      const tz = await getAppDisplayTimeZone();
      return rows.map((row) => {
        if (row.recordAtIso) {
          return { ...row, time: formatDoctorAppointmentRecordAt(row.recordAtIso, tz) };
        }
        return row;
      });
    },
    async getAppointmentStats(filter: Parameters<DoctorAppointmentsPort["getAppointmentStats"]>[0]) {
      return deps.appointmentsPort.getAppointmentStats(filter);
    },
  };
}
