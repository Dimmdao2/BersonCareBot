import type { AnalyticsTestAccountSpec } from '@/modules/analytics/analyticsAudience';
import type { AdminPlatformUserStatsPort } from '@/modules/admin-platform-stats/ports';
import {
  MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
  resolveAdminStatsLocalRange,
} from '@/modules/admin-platform-stats/registrationTimeRange';
import type {
  AdminRegistrationStatsPayload,
  AdminStatsTimePreset,
  AdminSubscriberStatsPayload,
} from '@/modules/admin-platform-stats/types';

type StatsRequest = {
  iana: string;
  preset: AdminStatsTimePreset;
  customFrom?: string;
  customTo?: string;
  audience: AnalyticsTestAccountSpec;
};

export function createAdminPlatformUserStatsService(port: AdminPlatformUserStatsPort) {
  return {
    async getRegistrationStats(params: StatsRequest): Promise<AdminRegistrationStatsPayload> {
      const { iana, preset, customFrom, customTo } = params;
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } =
        resolveAdminStatsLocalRange(iana, preset, customFrom, customTo, {
          enforceMinInclusiveDays: MIN_REGISTRATION_STATS_INCLUSIVE_DAYS,
        });

      const raw = await port.readStats({
        iana,
        startUtcIso,
        endExclusiveUtcIso,
        audience: params.audience,
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

    async getSubscriberStats(params: StatsRequest): Promise<AdminSubscriberStatsPayload> {
      const { iana, preset, customFrom, customTo } = params;
      const { fromDay, toDay, startUtcIso, endExclusiveUtcIso, dayKeys } =
        resolveAdminStatsLocalRange(iana, preset, customFrom, customTo);

      const raw = await port.readStats({
        iana,
        startUtcIso,
        endExclusiveUtcIso,
        audience: params.audience,
      });

      let running = raw.subscribersBeforeStart;
      const series = dayKeys.map((day) => {
        running += raw.subscribersNewByDay.get(day) ?? 0;
        return { day, cumulativeSubscribers: running };
      });

      const cumulativeEnd = series.at(-1)?.cumulativeSubscribers ?? raw.subscribersBeforeStart;
      const baseline = raw.subscribersBeforeStart;

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
