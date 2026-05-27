import type { ProductAnalyticsPort } from "@/modules/product-analytics/ports";

/** Short-retention raw events (`product_analytics_events_recent`). */
export const PRODUCT_ANALYTICS_RECENT_RETENTION_DAYS = 90;

/** Per-user hourly rollups (`product_analytics_user_hourly`). */
export const PRODUCT_ANALYTICS_USER_HOURLY_RETENTION_DAYS = 180;

/** Platform hourly rollups (`product_analytics_hourly`). */
export const PRODUCT_ANALYTICS_HOURLY_RETENTION_DAYS = 730;

/** Push send facts (`product_push_notifications`). */
export const PRODUCT_ANALYTICS_PUSH_RETENTION_DAYS = 730;

export type ProductAnalyticsRetentionParams = {
  recentDays?: number;
  userHourlyDays?: number;
  hourlyDays?: number;
  pushDays?: number;
  dryRun?: boolean;
};

export type ProductAnalyticsRetentionResult = {
  dryRun: boolean;
  recentDays: number;
  userHourlyDays: number;
  hourlyDays: number;
  pushDays: number;
  deletedRecent: number;
  deletedUserHourly: number;
  deletedHourly: number;
  deletedPushNotifications: number;
};

function clampDays(raw: number | undefined, fallback: number): number {
  const n = typeof raw === "number" && Number.isFinite(raw) ? Math.floor(raw) : fallback;
  return Math.max(1, n);
}

export async function runProductAnalyticsRetention(
  port: ProductAnalyticsPort,
  options?: ProductAnalyticsRetentionParams,
): Promise<ProductAnalyticsRetentionResult> {
  const dryRun = Boolean(options?.dryRun);
  const recentDays = clampDays(options?.recentDays, PRODUCT_ANALYTICS_RECENT_RETENTION_DAYS);
  const userHourlyDays = clampDays(options?.userHourlyDays, PRODUCT_ANALYTICS_USER_HOURLY_RETENTION_DAYS);
  const hourlyDays = clampDays(options?.hourlyDays, PRODUCT_ANALYTICS_HOURLY_RETENTION_DAYS);
  const pushDays = clampDays(options?.pushDays, PRODUCT_ANALYTICS_PUSH_RETENTION_DAYS);

  const [recent, userHourly, hourly, push] = await Promise.all([
    port.purgeRecentOlderThan(recentDays, { dryRun }),
    port.purgeUserHourlyOlderThan(userHourlyDays, { dryRun }),
    port.purgeHourlyOlderThan(hourlyDays, { dryRun }),
    port.purgePushNotificationsOlderThan(pushDays, { dryRun }),
  ]);

  return {
    dryRun,
    recentDays,
    userHourlyDays,
    hourlyDays,
    pushDays,
    deletedRecent: recent.deleted,
    deletedUserHourly: userHourly.deleted,
    deletedHourly: hourly.deleted,
    deletedPushNotifications: push.deleted,
  };
}
