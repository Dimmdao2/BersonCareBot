import {
  toDisplayZoneDayKey,
  toDisplayZoneHourBucketKey,
} from "@/shared/datetime/displayTimeZoneFormat";
import { truncateToUtcHour } from "@/modules/product-analytics/aggregateKeys";
import type {
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsEntryChannel,
} from "@/modules/product-analytics/types";
import {
  PRODUCT_ANALYTICS_DIM_ALL,
  PRODUCT_ANALYTICS_ENTRY_CHANNELS,
} from "@/modules/product-analytics/types";

export const PRODUCT_ANALYTICS_TOP_PAGES_LIMIT = 40;
export const PRODUCT_ANALYTICS_PAGE_HOURLY_TOP_PAGES_LIMIT = 8;
export const PRODUCT_ANALYTICS_CLIENT_ACTIVITY_LIMIT = 100;

export type ProductAnalyticsHourlyRollupRow = {
  bucketHour: string;
  eventType: string;
  entryChannel: string;
  pageKey: string;
  topicCode: string;
  pushKind: string;
  warmupSloganKey: string;
  eventCount: number;
};

export type ProductAnalyticsUserHourlyRollupRow = {
  bucketHour: string;
  userId: string;
  entryChannel: string;
  pageKey: string;
  appOpens: number;
  pageViews: number;
  pushOpens: number;
  activeMinutes: number;
  lastSeenAt: string | null;
};

export type WarmupSloganSampleRow = {
  sloganKey: string;
  sampleText: string | null;
};

function isRollupTotalDim(value: string): boolean {
  return value === PRODUCT_ANALYTICS_DIM_ALL;
}

function openRate(opened: number, sent: number): number {
  if (sent <= 0) return 0;
  return opened / sent;
}

function emptyChannelCounts(): Record<ProductAnalyticsEntryChannel, number> {
  return { pwa: 0, telegram: 0, max: 0, browser: 0 };
}

export function productAnalyticsWindowStartHour(windowHours: number, now = new Date()): string {
  const startMs = now.getTime() - windowHours * 60 * 60 * 1000;
  return truncateToUtcHour(new Date(startMs).toISOString());
}

export function buildAdminDashboard(input: {
  windowHours: number;
  displayTimezone: string;
  generatedAt?: string;
  startHourInclusive: string;
  hourlyRows: ProductAnalyticsHourlyRollupRow[];
  userHourlyRows: ProductAnalyticsUserHourlyRollupRow[];
  warmupSloganSamples?: WarmupSloganSampleRow[];
  userDisplayNames?: Record<string, string>;
}): ProductAnalyticsAdminDashboard {
  const displayTimezone = input.displayTimezone;
  const startMs = new Date(input.startHourInclusive).getTime();
  const inWindow = (bucketHour: string) => new Date(bucketHour).getTime() >= startMs;

  const hourly = input.hourlyRows.filter((r) => inWindow(r.bucketHour));
  const userHourly = input.userHourlyRows.filter((r) => inWindow(r.bucketHour));

  let totalAuthLogins = 0;
  let totalAppOpens = 0;
  let totalPageViews = 0;
  let totalPushOpens = 0;
  let totalPushSent = 0;
  let totalActiveMinutes = 0;

  const channelByBucket = new Map<string, Record<ProductAnalyticsEntryChannel, number>>();
  const channelTotals = emptyChannelCounts();
  const pageViews = new Map<string, number>();
  const pageUniqueUsers = new Map<string, Set<string>>();
  const pageViewsByBucket = new Map<string, Map<string, number>>();
  const pageUniqueUsersByBucket = new Map<string, Map<string, Set<string>>>();
  const topicSent = new Map<string, number>();
  const topicOpened = new Map<string, number>();
  const sloganSent = new Map<string, number>();
  const sloganOpened = new Map<string, number>();
  const sloganSample = new Map<string, string | null>();
  const clientSummary = new Map<
    string,
    {
      userId: string;
      displayName: string;
      lastSeenAt: string | null;
      appOpens: number;
      pageViews: number;
      pushOpens: number;
      activeMinutes: number;
      channels: Map<
        ProductAnalyticsEntryChannel,
        {
          appOpens: number;
          pageViews: number;
          pushOpens: number;
          activeMinutes: number;
        }
      >;
    }
  >();

  for (const row of input.warmupSloganSamples ?? []) {
    if (!sloganSample.has(row.sloganKey)) {
      sloganSample.set(row.sloganKey, row.sampleText);
    }
  }

  for (const r of hourly) {
    const isPlatformTotal =
      isRollupTotalDim(r.pageKey) &&
      isRollupTotalDim(r.topicCode) &&
      isRollupTotalDim(r.pushKind) &&
      isRollupTotalDim(r.warmupSloganKey);

    if (r.eventType === "auth_login" && isPlatformTotal) {
      totalAuthLogins += r.eventCount;
    }

    if (r.eventType === "app_open" && isPlatformTotal) {
      totalAppOpens += r.eventCount;
      if (PRODUCT_ANALYTICS_ENTRY_CHANNELS.includes(r.entryChannel as ProductAnalyticsEntryChannel)) {
        const ch = r.entryChannel as ProductAnalyticsEntryChannel;
        const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, displayTimezone);
        const bucketRow = channelByBucket.get(bucketKey) ?? emptyChannelCounts();
        bucketRow[ch] += r.eventCount;
        channelByBucket.set(bucketKey, bucketRow);
        channelTotals[ch] += r.eventCount;
      }
    }

    if (r.eventType === "page_view" && !isRollupTotalDim(r.pageKey)) {
      pageViews.set(r.pageKey, (pageViews.get(r.pageKey) ?? 0) + r.eventCount);
      totalPageViews += r.eventCount;
      const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, displayTimezone);
      const byPage = pageViewsByBucket.get(bucketKey) ?? new Map<string, number>();
      byPage.set(r.pageKey, (byPage.get(r.pageKey) ?? 0) + r.eventCount);
      pageViewsByBucket.set(bucketKey, byPage);
    }

    if (r.eventType === "push_sent") {
      totalPushSent += r.eventCount;
      if (!isRollupTotalDim(r.topicCode)) {
        topicSent.set(r.topicCode, (topicSent.get(r.topicCode) ?? 0) + r.eventCount);
      }
      if (r.pushKind === "warmup" && !isRollupTotalDim(r.warmupSloganKey)) {
        sloganSent.set(r.warmupSloganKey, (sloganSent.get(r.warmupSloganKey) ?? 0) + r.eventCount);
      }
    }

    if (r.eventType === "push_open") {
      totalPushOpens += r.eventCount;
      if (!isRollupTotalDim(r.topicCode)) {
        topicOpened.set(r.topicCode, (topicOpened.get(r.topicCode) ?? 0) + r.eventCount);
      }
      if (r.pushKind === "warmup" && !isRollupTotalDim(r.warmupSloganKey)) {
        sloganOpened.set(r.warmupSloganKey, (sloganOpened.get(r.warmupSloganKey) ?? 0) + r.eventCount);
      }
    }
  }

  const activeUserIds = new Set<string>();
  const dailyActiveUsers = new Map<string, Set<string>>();

  for (const r of userHourly) {
    totalActiveMinutes += r.activeMinutes;
    const activity = r.appOpens + r.pageViews + r.pushOpens + r.activeMinutes;
    if (activity <= 0) continue;
    activeUserIds.add(r.userId);
    const day = toDisplayZoneDayKey(r.bucketHour, displayTimezone);
    const daySet = dailyActiveUsers.get(day) ?? new Set<string>();
    daySet.add(r.userId);
    dailyActiveUsers.set(day, daySet);

    if (!isRollupTotalDim(r.pageKey) && r.pageViews > 0) {
      const users = pageUniqueUsers.get(r.pageKey) ?? new Set<string>();
      users.add(r.userId);
      pageUniqueUsers.set(r.pageKey, users);

      const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, displayTimezone);
      const byPage = pageUniqueUsersByBucket.get(bucketKey) ?? new Map<string, Set<string>>();
      const pageUsers = byPage.get(r.pageKey) ?? new Set<string>();
      pageUsers.add(r.userId);
      byPage.set(r.pageKey, pageUsers);
      pageUniqueUsersByBucket.set(bucketKey, byPage);
    }

    if (!PRODUCT_ANALYTICS_ENTRY_CHANNELS.includes(r.entryChannel as ProductAnalyticsEntryChannel)) {
      continue;
    }
    const ch = r.entryChannel as ProductAnalyticsEntryChannel;
    const client =
      clientSummary.get(r.userId) ??
      (() => {
        const created = {
          userId: r.userId,
          displayName: input.userDisplayNames?.[r.userId] ?? "Пациент",
          lastSeenAt: null as string | null,
          appOpens: 0,
          pageViews: 0,
          pushOpens: 0,
          activeMinutes: 0,
          channels: new Map<
            ProductAnalyticsEntryChannel,
            {
              appOpens: number;
              pageViews: number;
              pushOpens: number;
              activeMinutes: number;
            }
          >(),
        };
        clientSummary.set(r.userId, created);
        return created;
      })();

    client.appOpens += r.appOpens;
    client.pageViews += r.pageViews;
    client.pushOpens += r.pushOpens;
    client.activeMinutes += r.activeMinutes;
    if (!client.lastSeenAt || new Date(r.lastSeenAt ?? r.bucketHour).getTime() > new Date(client.lastSeenAt).getTime()) {
      client.lastSeenAt = r.lastSeenAt ?? r.bucketHour;
    }

    const channelCounters = client.channels.get(ch) ?? {
      appOpens: 0,
      pageViews: 0,
      pushOpens: 0,
      activeMinutes: 0,
    };
    channelCounters.appOpens += r.appOpens;
    channelCounters.pageViews += r.pageViews;
    channelCounters.pushOpens += r.pushOpens;
    channelCounters.activeMinutes += r.activeMinutes;
    client.channels.set(ch, channelCounters);
  }

  const entryChannelHourly = [...channelByBucket.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([bucket, counts]) => ({
      bucket,
      pwa: counts.pwa,
      telegram: counts.telegram,
      max: counts.max,
      browser: counts.browser,
    }));

  const topPages = [...pageViews.entries()]
    .map(([pageKey, views]) => ({
      pageKey,
      views,
      uniqueUsers: pageUniqueUsers.get(pageKey)?.size ?? 0,
    }))
    .sort((a, b) => b.views - a.views || a.pageKey.localeCompare(b.pageKey))
    .slice(0, PRODUCT_ANALYTICS_TOP_PAGES_LIMIT);

  const pageHourlyTopSet = new Set(
    topPages
      .slice(0, PRODUCT_ANALYTICS_PAGE_HOURLY_TOP_PAGES_LIMIT)
      .map((row) => row.pageKey),
  );
  const pageViewsHourly = [...pageViewsByBucket.entries()]
    .flatMap(([bucket, byPage]) =>
      [...byPage.entries()]
        .filter(([pageKey]) => pageHourlyTopSet.has(pageKey))
        .map(([pageKey, views]) => ({
          bucket,
          pageKey,
          views,
          uniqueUsers: pageUniqueUsersByBucket.get(bucket)?.get(pageKey)?.size ?? 0,
        })),
    )
    .sort((a, b) => a.bucket.localeCompare(b.bucket) || b.views - a.views || a.pageKey.localeCompare(b.pageKey));

  const topicCodes = new Set([...topicSent.keys(), ...topicOpened.keys()]);
  const pushByTopic = [...topicCodes]
    .map((topicCode) => {
      const sent = topicSent.get(topicCode) ?? 0;
      const opened = topicOpened.get(topicCode) ?? 0;
      return { topicCode, sent, opened, openRate: openRate(opened, sent) };
    })
    .sort((a, b) => b.sent - a.sent || a.topicCode.localeCompare(b.topicCode));

  const sloganKeys = new Set([...sloganSent.keys(), ...sloganOpened.keys()]);
  const warmupSlogans = [...sloganKeys]
    .map((sloganKey) => {
      const sent = sloganSent.get(sloganKey) ?? 0;
      const opened = sloganOpened.get(sloganKey) ?? 0;
      return {
        sloganKey,
        sent,
        opened,
        openRate: openRate(opened, sent),
        sampleText: sloganSample.get(sloganKey) ?? null,
      };
    })
    .sort((a, b) => b.sent - a.sent || a.sloganKey.localeCompare(b.sloganKey));

  const activeUsersDaily = [...dailyActiveUsers.entries()]
    .map(([day, users]) => ({ day, activeUsers: users.size }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const entryChannelTotals = PRODUCT_ANALYTICS_ENTRY_CHANNELS.map((entryChannel) => ({
    entryChannel,
    appOpens: channelTotals[entryChannel],
  }));

  const clientActivity = [...clientSummary.values()]
    .map((row) => {
      const channels = PRODUCT_ANALYTICS_ENTRY_CHANNELS.map((entryChannel) => {
        const stats = row.channels.get(entryChannel) ?? {
          appOpens: 0,
          pageViews: 0,
          pushOpens: 0,
          activeMinutes: 0,
        };
        const totalActivity = stats.appOpens + stats.pageViews + stats.pushOpens + stats.activeMinutes;
        return {
          entryChannel,
          appOpens: stats.appOpens,
          pageViews: stats.pageViews,
          pushOpens: stats.pushOpens,
          activeMinutes: stats.activeMinutes,
          totalActivity,
        };
      }).filter((stats) => stats.totalActivity > 0);
      const totalActivity = row.appOpens + row.pageViews + row.pushOpens + row.activeMinutes;
      return {
        userId: row.userId,
        displayName: row.displayName,
        lastSeenAt: row.lastSeenAt,
        appOpens: row.appOpens,
        pageViews: row.pageViews,
        pushOpens: row.pushOpens,
        activeMinutes: row.activeMinutes,
        totalActivity,
        channels,
      };
    })
    .sort(
      (a, b) =>
        b.totalActivity - a.totalActivity ||
        (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? "") ||
        a.displayName.localeCompare(b.displayName),
    )
    .slice(0, PRODUCT_ANALYTICS_CLIENT_ACTIVITY_LIMIT);

  return {
    windowHours: input.windowHours,
    displayTimezone,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      uniqueActiveUsers: activeUserIds.size,
      totalAuthLogins,
      totalAppOpens,
      totalPageViews,
      totalActiveMinutes,
      totalPushSent,
      totalPushOpens,
      pushOpenRate: openRate(totalPushOpens, totalPushSent),
    },
    entryChannelHourly,
    entryChannelTotals,
    topPages,
    pageViewsHourly,
    pushByTopic,
    warmupSlogans,
    activeUsersDaily,
    clientActivity,
  };
}
