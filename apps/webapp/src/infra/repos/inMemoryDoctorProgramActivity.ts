import type { DoctorProgramActivityPort } from '@/modules/doctor-program-activity/ports';

/** No in-memory program-action-log dataset; mirrors `inMemoryDoctorAppointmentsPort`'s zero stub. */
export const inMemoryDoctorProgramActivityPort: DoctorProgramActivityPort = {
  async getActivityKpis() {
    return {
      patientsWithActiveProgram: 0,
      patientsWithActivityInPeriod: 0,
      doneCountInPeriod: 0,
      daysWithActivityInPeriod: 0,
      activePatientShare: 0,
    };
  },
  async getActivityDailySeries() {
    return [];
  },
  async listPatientsWithActivity() {
    return { items: [], hasMore: false };
  },
};
