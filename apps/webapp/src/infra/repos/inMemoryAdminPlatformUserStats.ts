import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";

export function createInMemoryAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async getRegistrationStats({ dayKeys }) {
      const registrationsByDay = new Map<string, number>();
      const mergesByDay = new Map<string, number>();
      for (const k of dayKeys) {
        registrationsByDay.set(k, 0);
        mergesByDay.set(k, 0);
      }
      return { registrationsTotal: 0, mergesTotal: 0, registrationsByDay, mergesByDay };
    },

    async getSubscriberBindingStats() {
      return { countBeforeStart: 0, newByDay: new Map<string, number>() };
    },
  };
}
