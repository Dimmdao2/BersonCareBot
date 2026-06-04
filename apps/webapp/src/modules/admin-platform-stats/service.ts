import type { AdminPlatformUserStatsPort } from "@/modules/admin-platform-stats/ports";
import {
  MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
  resolveAdminStatsLocalRange,
} from "@/modules/admin-platform-stats/registrationTimeRange";
import type {
  AdminRegistrationStatsPayload,
  AdminStatsTimePreset,
  AdminSubscriberStatsPayload,
} from "@/modules/admin-platform-stats/types";

export function createAdminPlatformUserStatsService(port: AdminPlatformUserStatsPort) {
  return {
    async getRegistrationStats(params: {
      iana: string;
      preset: AdminStatsTimePreset;
      customFrom?: string;
      customTo?: string;
    }): Promise<AdminRegistrationStatsPayload> {
      const { iana, preset, customFrom, customTo } = params;
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } = resolveAdminStatsLocalRange(
        iana,
        preset,
        customFrom,
        customTo,
        { enforceMinInclusiveDays: MIN_REGISTRATION_STATS_INCLUSIVE_DAYS },
      );

      const raw = await port.getRegistrationStats({
        iana,
        startUtcIso,
        endExclusiveUtcIso,
        dayKeys,
      });

      const series = dayKeys.map((day) => ({
        day,
        registrations: raw.registrationsByDay.get(day) ?? 0,
        merges: raw.mergesByDay.get(day) ?? 0,
      }));

      return {
        iana,
        fromDay,
        toDay,
        startUtcIso,
        endExclusiveUtcIso,
        summary: {
          registrations: raw.registrationsTotal,
          merges: raw.mergesTotal,
          combined: raw.registrationsTotal + raw.mergesTotal,
        },
        series,
      };
    },

    async getSubscriberStats(params: {
      iana: string;
      preset: AdminStatsTimePreset;
      customFrom?: string;
      customTo?: string;
    }): Promise<AdminSubscriberStatsPayload> {
      const { iana, preset, customFrom, customTo } = params;
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } = resolveAdminStatsLocalRange(
        iana,
        preset,
        customFrom,
        customTo,
      );

      const raw = await port.getSubscriberBindingStats({
        iana,
        startUtcIso,
        endExclusiveUtcIso,
      });

      let running = raw.countBeforeStart;
      const series = dayKeys.map((day) => {
        running += raw.newByDay.get(day) ?? 0;
        return { day, cumulativeSubscribers: running };
      });

      const cumulativeEnd = series.at(-1)?.cumulativeSubscribers ?? raw.countBeforeStart;
      const baseline = raw.countBeforeStart;

      return {
        iana,
        fromDay,
        toDay,
        startUtcIso,
        endExclusiveUtcIso,
        summary: {
          cumulativeEnd,
          deltaInRange: cumulativeEnd - baseline,
        },
        series,
      };
    },
  };
}
