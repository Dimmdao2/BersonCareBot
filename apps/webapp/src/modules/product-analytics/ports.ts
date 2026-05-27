import type {
  CreatePushNotificationInput,
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";

export type ProductAnalyticsPort = {
  recordEventsBatch(events: ProductAnalyticsIngestEvent[]): Promise<void>;
  createPushNotification(row: CreatePushNotificationInput): Promise<void>;
  recordPushOpen(input: RecordPushOpenInput): Promise<{ deduped: boolean }>;
  getAdminDashboard(params: { windowHours: number }): Promise<ProductAnalyticsAdminDashboard>;
  purgeRecentOlderThan(days: number): Promise<{ deleted: number }>;
  purgeUserHourlyOlderThan(days: number): Promise<{ deleted: number }>;
};
