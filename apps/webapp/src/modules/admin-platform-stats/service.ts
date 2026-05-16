import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";
import { resolveRegistrationLocalRange } from "@/modules/admin-platform-stats/registrationTimeRange";
import type { AdminRegistrationPreset, AdminRegistrationStatsPayload } from "@/modules/admin-platform-stats/types";

export function createAdminPlatformUserStatsService(port: AdminPlatformUserStatsPort) {
  return {
    async getRegistrationStats(params: {
      iana: string;
      preset: AdminRegistrationPreset;
      customFrom?: string;
      customTo?: string;
    }): Promise<AdminRegistrationStatsPayload> {
      const { iana, preset, customFrom, customTo } = params;
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } = resolveRegistrationLocalRange(
        iana,
        preset,
        customFrom,
        customTo,
      );

      const raw = await port.getRegistrationStats({
        iana,
        startUtcIso,
        endExclusiveUtcIso,
        dayKeys,
      });

      const series = dayKeys.map((day) => ({
        day,
        newUsers: raw.newByDay.get(day) ?? 0,
        merges: raw.mergesByDay.get(day) ?? 0,
      }));

      return {
        iana,
        fromDay,
        toDay,
        startUtcIso,
        endExclusiveUtcIso,
        summary: {
          newUsers: raw.newUsersTotal,
          merges: raw.mergesTotal,
          combined: raw.newUsersTotal + raw.mergesTotal,
        },
        series,
      };
    },
  };
}
