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
  generatedAt?: string;
  startHourInclusive: string;
  hourlyRows: ProductAnalyticsHourlyRollupRow[];
  userHourlyRows: ProductAnalyticsUserHourlyRollupRow[];
  warmupSloganSamples?: WarmupSloganSampleRow[];
}): ProductAnalyticsAdminDashboard {
  const startMs = new Date(input.startHourInclusive).getTime();
  const inWindow = (bucketHour: string) => new Date(bucketHour).getTime() >= startMs;

  const hourly = input.hourlyRows.filter((r) => inWindow(r.bucketHour));
  const userHourly = input.userHourlyRows.filter((r) => inWindow(r.bucketHour));

  let totalAppOpens = 0;
  let totalPageViews = 0;
  let totalPushOpens = 0;
  let totalPushSent = 0;

  const channelByBucket = new Map<string, Record<ProductAnalyticsEntryChannel, number>>();
  const pageViews = new Map<string, number>();
  const pageUniqueUsers = new Map<string, Set<string>>();
  const topicSent = new Map<string, number>();
  const topicOpened = new Map<string, number>();
  const sloganSent = new Map<string, number>();
  const sloganOpened = new Map<string, number>();
  const sloganSample = new Map<string, string | null>();

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

    if (r.eventType === "app_open" && isPlatformTotal) {
      totalAppOpens += r.eventCount;
      if (PRODUCT_ANALYTICS_ENTRY_CHANNELS.includes(r.entryChannel as ProductAnalyticsEntryChannel)) {
        const ch = r.entryChannel as ProductAnalyticsEntryChannel;
        const bucketRow = channelByBucket.get(r.bucketHour) ?? emptyChannelCounts();
        bucketRow[ch] += r.eventCount;
        channelByBucket.set(r.bucketHour, bucketRow);
      }
    }

    if (r.eventType === "page_view" && !isRollupTotalDim(r.pageKey)) {
      pageViews.set(r.pageKey, (pageViews.get(r.pageKey) ?? 0) + r.eventCount);
      totalPageViews += r.eventCount;
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
    const activity = r.appOpens + r.pageViews + r.pushOpens + r.activeMinutes;
    if (activity <= 0) continue;
    activeUserIds.add(r.userId);
    const day = r.bucketHour.slice(0, 10);
    const daySet = dailyActiveUsers.get(day) ?? new Set<string>();
    daySet.add(r.userId);
    dailyActiveUsers.set(day, daySet);

    if (!isRollupTotalDim(r.pageKey) && r.pageViews > 0) {
      const users = pageUniqueUsers.get(r.pageKey) ?? new Set<string>();
      users.add(r.userId);
      pageUniqueUsers.set(r.pageKey, users);
    }
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

  return {
    windowHours: input.windowHours,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      uniqueActiveUsers: activeUserIds.size,
      totalAppOpens,
      totalPageViews,
      totalPushOpens,
      pushOpenRate: openRate(totalPushOpens, totalPushSent),
    },
    entryChannelHourly,
    topPages,
    pushByTopic,
    warmupSlogans,
    activeUsersDaily,
  };
}
