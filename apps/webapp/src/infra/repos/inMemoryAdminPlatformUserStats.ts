import type { AdminPlatformUserStatsPort } from '@/modules/admin-platform-stats/ports';

export function createInMemoryAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async readStats() {
      return {
        registrationsTotal: 0,
        mergesTotal: 0,
        registrationsByDay: new Map<string, number>(),
        mergesByDay: new Map<string, number>(),
        subscribersBeforeStart: 0,
        subscribersNewByDay: new Map<string, number>(),
      };
    },
  };
}
