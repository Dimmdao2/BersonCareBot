import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";

export function createInMemoryAdminPlatformUserStatsPort(): AdminPlatformUserStatsPort {
  return {
    async getRegistrationStats({ dayKeys }) {
      const newByDay = new Map<string, number>();
      const mergesByDay = new Map<string, number>();
      for (const k of dayKeys) {
        newByDay.set(k, 0);
        mergesByDay.set(k, 0);
      }
      return { newUsersTotal: 0, mergesTotal: 0, newByDay, mergesByDay };
    },

    async getSubscriberBindingStats() {
      return { countBeforeStart: 0, newByDay: new Map<string, number>() };
    },
  };
}
