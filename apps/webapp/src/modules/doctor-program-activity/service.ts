import type { DoctorProgramActivityPort } from './ports';

export type DoctorProgramActivityServiceDeps = {
  activityPort: DoctorProgramActivityPort;
};

export function createDoctorProgramActivityService(deps: DoctorProgramActivityServiceDeps) {
  return {
    async getActivityKpis(
      period: Parameters<DoctorProgramActivityPort['getActivityKpis']>[0],
      audience: Parameters<DoctorProgramActivityPort['getActivityKpis']>[1],
    ) {
      return deps.activityPort.getActivityKpis(period, audience);
    },
    async getActivityDailySeries(
      period: Parameters<DoctorProgramActivityPort['getActivityDailySeries']>[0],
      audience: Parameters<DoctorProgramActivityPort['getActivityDailySeries']>[1],
    ) {
      return deps.activityPort.getActivityDailySeries(period, audience);
    },
    async listPatientsWithActivity(
      period: Parameters<DoctorProgramActivityPort['listPatientsWithActivity']>[0],
      audience: Parameters<DoctorProgramActivityPort['listPatientsWithActivity']>[1],
      limit: number,
      offset: number,
    ) {
      return deps.activityPort.listPatientsWithActivity(period, audience, limit, offset);
    },
  };
}

export type DoctorProgramActivityService = ReturnType<typeof createDoctorProgramActivityService>;
