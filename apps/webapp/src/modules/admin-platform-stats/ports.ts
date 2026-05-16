import type { AdminRegistrationDayPoint } from "@/modules/admin-platform-stats/types";

export type AdminPlatformUserStatsPort = {
  getRegistrationStats(params: {
    iana: string;
    startUtcIso: string;
    endExclusiveUtcIso: string;
    /** Все календарные дни от from до to (YYYY-MM-DD) в `iana` для выравнивания ряда */
    dayKeys: string[];
  }): Promise<{
    newUsersTotal: number;
    mergesTotal: number;
    newByDay: Map<string, number>;
    mergesByDay: Map<string, number>;
  }>;
};
