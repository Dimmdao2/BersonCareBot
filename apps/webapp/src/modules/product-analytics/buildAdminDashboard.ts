import {
  toDisplayZoneDayKey,
  toDisplayZoneHourBucketKey,
} from '@/shared/datetime/displayTimeZoneFormat';
import { truncateToUtcHour } from '@/modules/product-analytics/aggregateKeys';
import type {
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsEntryChannel,
  ProductAnalyticsUserAggregates,
} from '@/modules/product-analytics/types';
import {
  groupProductAnalyticsPageKey,
  labelProductAnalyticsPageKey,
} from '@/modules/product-analytics/productAnalyticsPageKey';
import { labelProductAnalyticsTopicCode } from '@/modules/product-analytics/productAnalyticsTopicLabels';
import {
  PRODUCT_ANALYTICS_DIM_ALL,
  PRODUCT_ANALYTICS_ENTRY_CHANNELS,
} from '@/modules/product-analytics/types';

export const PRODUCT_ANALYTICS_TOP_PAGES_LIMIT = 40;
export const PRODUCT_ANALYTICS_PAGE_HOURLY_TOP_PAGES_LIMIT = 8;

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

function rollupPageKey(rawPageKey: string): string {
  return groupProductAnalyticsPageKey(rawPageKey);
}

function addPageViewCount(map: Map<string, number>, rawPageKey: string, count: number): void {
  const key = rollupPageKey(rawPageKey);
  map.set(key, (map.get(key) ?? 0) + count);
}


export function productAnalyticsWindowStartHour(windowHours: number, now = new Date()): string {
  const startMs = now.getTime() - windowHours * 60 * 60 * 1000;
  return truncateToUtcHour(new Date(startMs).toISOString());
}

/**
 * Тот же СЧЁТ, что считает именованный корень, — для пути без базы (in-memory порт). Здесь строки
 * пользователей ещё видны: они лежат в памяти процесса и наружу не уезжают. На боевом пути этой
 * функции соответствует тело `app.read_product_analytics_dashboard`, и живая проверка
 * `productAnalyticsDashboard.devDbProof` сверяет их числа до единицы — расхождение двух
 * реализаций ловится тестом, а не глазами.
 */
export function aggregateProductAnalyticsUserHourly(
  rows: ProductAnalyticsUserHourlyRollupRow[],
  input: { displayTimezone: string; startHourInclusive: string },
): ProductAnalyticsUserAggregates {
  const startMs = new Date(input.startHourInclusive).getTime();
  const tz = input.displayTimezone;

  let totalActiveMinutes = 0;
  const activeUserIds = new Set<string>();
  const dailyActiveUsers = new Map<string, Set<string>>();
  const pageUsers = new Map<string, Set<string>>();
  const pageUsersByBucket = new Map<string, Map<string, Set<string>>>();

  for (const r of rows) {
    if (new Date(r.bucketHour).getTime() < startMs) continue;
    totalActiveMinutes += r.activeMinutes;
    const activity = r.appOpens + r.pageViews + r.pushOpens + r.activeMinutes;
    if (activity <= 0) continue;

    activeUserIds.add(r.userId);
    const day = toDisplayZoneDayKey(r.bucketHour, tz);
    const daySet = dailyActiveUsers.get(day) ?? new Set<string>();
    daySet.add(r.userId);
    dailyActiveUsers.set(day, daySet);

    if (isRollupTotalDim(r.pageKey) || r.pageViews <= 0) continue;
    const groupKey = rollupPageKey(r.pageKey);
    const users = pageUsers.get(groupKey) ?? new Set<string>();
    users.add(r.userId);
    pageUsers.set(groupKey, users);

    const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, tz);
    const byPage = pageUsersByBucket.get(bucketKey) ?? new Map<string, Set<string>>();
    const bucketUsers = byPage.get(groupKey) ?? new Set<string>();
    bucketUsers.add(r.userId);
    byPage.set(groupKey, bucketUsers);
    pageUsersByBucket.set(bucketKey, byPage);
  }

  return {
    totalActiveMinutes,
    uniqueActiveUsers: activeUserIds.size,
    activeUsersDaily: [...dailyActiveUsers.entries()]
      .map(([day, users]) => ({ day, activeUsers: users.size }))
      .sort((a, b) => a.day.localeCompare(b.day)),
    pageUniqueUsers: [...pageUsers.entries()].map(([pageKey, users]) => ({
      pageKey,
      uniqueUsers: users.size,
    })),
    pageUniqueUsersHourly: [...pageUsersByBucket.entries()].flatMap(([bucket, byPage]) =>
      [...byPage.entries()].map(([pageKey, users]) => ({
        bucket,
        pageKey,
        uniqueUsers: users.size,
      })),
    ),
  };
}

export function buildAdminDashboard(input: {
  windowHours: number;
  displayTimezone: string;
  generatedAt?: string;
  startHourInclusive: string;
  hourlyRows: ProductAnalyticsHourlyRollupRow[];
  /**
   * Величины про людей приезжают СЧЁТОМ, а не строками. На боевом пути их считает именованный
   * корень под владельцем шва; в памяти — `aggregateProductAnalyticsUserHourly` из этого же файла.
   * Строк пользователей сборщик больше не видит вовсе, поэтому и отдать их экрану не может.
   */
  userAggregates: ProductAnalyticsUserAggregates;
  warmupSloganSamples?: WarmupSloganSampleRow[];
}): ProductAnalyticsAdminDashboard {
  const displayTimezone = input.displayTimezone;
  const startMs = new Date(input.startHourInclusive).getTime();
  const inWindow = (bucketHour: string) => new Date(bucketHour).getTime() >= startMs;

  const hourly = input.hourlyRows.filter((r) => inWindow(r.bucketHour));

  let totalAuthLogins = 0;
  let totalAppOpens = 0;
  let totalPageViews = 0;
  let totalPushOpens = 0;
  let totalPushSent = 0;

  const channelByBucket = new Map<string, Record<ProductAnalyticsEntryChannel, number>>();
  const channelTotals = emptyChannelCounts();
  const pageViews = new Map<string, number>();
  const pageViewsByBucket = new Map<string, Map<string, number>>();
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

    if (r.eventType === 'auth_login' && isPlatformTotal) {
      totalAuthLogins += r.eventCount;
    }

    if (r.eventType === 'app_open' && isPlatformTotal) {
      totalAppOpens += r.eventCount;
      if (
        PRODUCT_ANALYTICS_ENTRY_CHANNELS.includes(r.entryChannel as ProductAnalyticsEntryChannel)
      ) {
        const ch = r.entryChannel as ProductAnalyticsEntryChannel;
        const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, displayTimezone);
        const bucketRow = channelByBucket.get(bucketKey) ?? emptyChannelCounts();
        bucketRow[ch] += r.eventCount;
        channelByBucket.set(bucketKey, bucketRow);
        channelTotals[ch] += r.eventCount;
      }
    }

    if (r.eventType === 'page_view' && !isRollupTotalDim(r.pageKey)) {
      addPageViewCount(pageViews, r.pageKey, r.eventCount);
      totalPageViews += r.eventCount;
      const bucketKey = toDisplayZoneHourBucketKey(r.bucketHour, displayTimezone);
      const byPage = pageViewsByBucket.get(bucketKey) ?? new Map<string, number>();
      addPageViewCount(byPage, r.pageKey, r.eventCount);
      pageViewsByBucket.set(bucketKey, byPage);
    }

    if (r.eventType === 'push_sent') {
      totalPushSent += r.eventCount;
      if (!isRollupTotalDim(r.topicCode)) {
        topicSent.set(r.topicCode, (topicSent.get(r.topicCode) ?? 0) + r.eventCount);
      }
      if (r.pushKind === 'warmup' && !isRollupTotalDim(r.warmupSloganKey)) {
        sloganSent.set(r.warmupSloganKey, (sloganSent.get(r.warmupSloganKey) ?? 0) + r.eventCount);
      }
    }

    if (r.eventType === 'push_open') {
      totalPushOpens += r.eventCount;
      if (!isRollupTotalDim(r.topicCode)) {
        topicOpened.set(r.topicCode, (topicOpened.get(r.topicCode) ?? 0) + r.eventCount);
      }
      if (r.pushKind === 'warmup' && !isRollupTotalDim(r.warmupSloganKey)) {
        sloganOpened.set(
          r.warmupSloganKey,
          (sloganOpened.get(r.warmupSloganKey) ?? 0) + r.eventCount,
        );
      }
    }
  }

  // Уникальные люди приезжают уже посчитанными и уже СХЛОПНУТЫМИ по правилам группировки:
  // `count(distinct)` после схлопывания — единственный способ не задвоить человека, открывшего два
  // сырых ключа одной группы.
  const pageUniqueUsers = new Map(
    input.userAggregates.pageUniqueUsers.map((r) => [r.pageKey, r.uniqueUsers] as const),
  );
  const pageUniqueUsersByBucket = new Map<string, Map<string, number>>();
  for (const r of input.userAggregates.pageUniqueUsersHourly) {
    const byPage = pageUniqueUsersByBucket.get(r.bucket) ?? new Map<string, number>();
    byPage.set(r.pageKey, r.uniqueUsers);
    pageUniqueUsersByBucket.set(r.bucket, byPage);
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
      pageLabel: labelProductAnalyticsPageKey(pageKey),
      views,
      uniqueUsers: pageUniqueUsers.get(pageKey) ?? 0,
    }))
    .sort((a, b) => b.views - a.views || a.pageKey.localeCompare(b.pageKey))
    .slice(0, PRODUCT_ANALYTICS_TOP_PAGES_LIMIT);

  const pageHourlyTopSet = new Set(
    topPages.slice(0, PRODUCT_ANALYTICS_PAGE_HOURLY_TOP_PAGES_LIMIT).map((row) => row.pageKey),
  );
  const pageViewsHourly = [...pageViewsByBucket.entries()]
    .flatMap(([bucket, byPage]) =>
      [...byPage.entries()]
        .filter(([pageKey]) => pageHourlyTopSet.has(pageKey))
        .map(([pageKey, views]) => ({
          bucket,
          pageKey,
          views,
          uniqueUsers: pageUniqueUsersByBucket.get(bucket)?.get(pageKey) ?? 0,
        })),
    )
    .sort(
      (a, b) =>
        a.bucket.localeCompare(b.bucket) || b.views - a.views || a.pageKey.localeCompare(b.pageKey),
    );

  const topicCodes = new Set([...topicSent.keys(), ...topicOpened.keys()]);
  const pushByTopic = [...topicCodes]
    .map((topicCode) => {
      const sent = topicSent.get(topicCode) ?? 0;
      const opened = topicOpened.get(topicCode) ?? 0;
      return {
        topicCode,
        topicLabel: labelProductAnalyticsTopicCode(topicCode),
        sent,
        opened,
        openRate: openRate(opened, sent),
      };
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

  const activeUsersDaily = [...input.userAggregates.activeUsersDaily].sort((a, b) =>
    a.day.localeCompare(b.day),
  );

  const entryChannelTotals = PRODUCT_ANALYTICS_ENTRY_CHANNELS.map((entryChannel) => ({
    entryChannel,
    appOpens: channelTotals[entryChannel],
  }));

  return {
    windowHours: input.windowHours,
    displayTimezone,
    generatedAt: input.generatedAt ?? new Date().toISOString(),
    summary: {
      uniqueActiveUsers: input.userAggregates.uniqueActiveUsers,
      totalAuthLogins,
      totalAppOpens,
      totalPageViews,
      totalActiveMinutes: input.userAggregates.totalActiveMinutes,
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
  };
}
