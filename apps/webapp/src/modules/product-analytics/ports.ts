import type { AnalyticsTestAccountSpec } from '@/modules/analytics/analyticsAudience';
import type {
  CreatePushNotificationInput,
  ListRegistrationEventsParams,
  ListRegistrationEventsResult,
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from '@/modules/product-analytics/types';

export type ProductAnalyticsPurgeOptions = {
  dryRun?: boolean;
};

export type ProductAnalyticsPort = {
  recordEventsBatch(events: ProductAnalyticsIngestEvent[]): Promise<void>;
  createPushNotification(row: CreatePushNotificationInput): Promise<void>;
  recordPushOpen(input: RecordPushOpenInput): Promise<{ deduped: boolean }>;
  getAdminDashboard(params: {
    windowHours: number;
    /**
     * Служебные учётки приезжают СПИСКОМ идентификаторов, а не готовым списком id: принципал
     * экрана (`app_platform_settings`) резолвить их в id не может — прав на `platform_users` и
     * `user_channel_bindings` у него нет. Отсев делает уже тело именованного корня.
     */
    audience: AnalyticsTestAccountSpec;
  }): Promise<ProductAnalyticsAdminDashboard>;
  purgeRecentOlderThan(
    days: number,
    options?: ProductAnalyticsPurgeOptions,
  ): Promise<{ deleted: number }>;
  purgeUserHourlyOlderThan(
    days: number,
    options?: ProductAnalyticsPurgeOptions,
  ): Promise<{ deleted: number }>;
  purgeHourlyOlderThan(
    days: number,
    options?: ProductAnalyticsPurgeOptions,
  ): Promise<{ deleted: number }>;
  purgePushNotificationsOlderThan(
    days: number,
    options?: ProductAnalyticsPurgeOptions,
  ): Promise<{ deleted: number }>;
  listRegistrationEvents(
    params: ListRegistrationEventsParams,
  ): Promise<ListRegistrationEventsResult>;
};
