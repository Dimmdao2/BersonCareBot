import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { formatDoctorAppointmentRecordAt } from "@/shared/lib/formatBusinessDateTime";
import type { DoctorAppointmentsPort } from "./ports";

export type DoctorAppointmentsServiceDeps = {
  appointmentsPort: DoctorAppointmentsPort;
};

export function createDoctorAppointmentsService(deps: DoctorAppointmentsServiceDeps) {
  return {
    async listAppointmentsForSpecialist(
      filter: Parameters<DoctorAppointmentsPort["listAppointmentsForSpecialist"]>[0],
      audience?: Parameters<DoctorAppointmentsPort["listAppointmentsForSpecialist"]>[1],
    ) {
      const rows = await deps.appointmentsPort.listAppointmentsForSpecialist(filter, audience);
      const tz = await getAppDisplayTimeZone();
      return rows.map((row) => {
        const dateKey = row.recordAtIso
          ? new Intl.DateTimeFormat("sv-SE", { timeZone: tz }).format(new Date(row.recordAtIso))
          : "";
        if (row.recordAtIso) {
          return { ...row, time: formatDoctorAppointmentRecordAt(row.recordAtIso, tz), dateKey };
        }
        return { ...row, dateKey };
      });
    },
    async getAppointmentStats(
      filter: Parameters<DoctorAppointmentsPort["getAppointmentStats"]>[0],
      audience?: Parameters<DoctorAppointmentsPort["getAppointmentStats"]>[1],
    ) {
      return deps.appointmentsPort.getAppointmentStats(filter, audience);
    },
    async getDashboardAppointmentMetrics(
      audience?: Parameters<DoctorAppointmentsPort["getDashboardAppointmentMetrics"]>[0],
    ) {
      return deps.appointmentsPort.getDashboardAppointmentMetrics(audience);
    },
  };
}
