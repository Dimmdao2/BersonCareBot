import type {
  CreatePushNotificationInput,
  ListRegistrationEventsParams,
  ListRegistrationEventsResult,
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";

export type ProductAnalyticsPurgeOptions = {
  dryRun?: boolean;
};

export type ProductAnalyticsPort = {
  recordEventsBatch(events: ProductAnalyticsIngestEvent[]): Promise<void>;
  createPushNotification(row: CreatePushNotificationInput): Promise<void>;
  recordPushOpen(input: RecordPushOpenInput): Promise<{ deduped: boolean }>;
  getAdminDashboard(params: {
    windowHours: number;
    /** When true (dev_mode || debug_forward_to_admin), test accounts stay in aggregates. */
    includeTestAccounts?: boolean;
  }): Promise<ProductAnalyticsAdminDashboard>;
  purgeRecentOlderThan(days: number, options?: ProductAnalyticsPurgeOptions): Promise<{ deleted: number }>;
  purgeUserHourlyOlderThan(days: number, options?: ProductAnalyticsPurgeOptions): Promise<{ deleted: number }>;
  purgeHourlyOlderThan(days: number, options?: ProductAnalyticsPurgeOptions): Promise<{ deleted: number }>;
  purgePushNotificationsOlderThan(
    days: number,
    options?: ProductAnalyticsPurgeOptions,
  ): Promise<{ deleted: number }>;
  listRegistrationEvents(params: ListRegistrationEventsParams): Promise<ListRegistrationEventsResult>;
};
