import { normalizePageKey } from "@/modules/product-analytics/normalizePageKey";
import type { ProductAnalyticsPort } from "@/modules/product-analytics/ports";
import { clampProductAnalyticsWindowHours } from "@/modules/product-analytics/timeRange";
import type {
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";
import { PRODUCT_ANALYTICS_ENTRY_CHANNELS } from "@/modules/product-analytics/types";

const MAX_BATCH_SIZE = 20;

function isEntryChannel(v: string): v is (typeof PRODUCT_ANALYTICS_ENTRY_CHANNELS)[number] {
  return (PRODUCT_ANALYTICS_ENTRY_CHANNELS as readonly string[]).includes(v);
}

function prepareIngestEvent(event: ProductAnalyticsIngestEvent): ProductAnalyticsIngestEvent {
  const pageKey =
    event.pageKey != null && event.pageKey !== ""
      ? (normalizePageKey(event.pageKey) ?? undefined)
      : undefined;

  return {
    ...event,
    occurredAt: event.occurredAt ?? new Date().toISOString(),
    pageKey,
  };
}

export function createProductAnalyticsService(port: ProductAnalyticsPort) {
  return {
    async recordEventsBatch(events: ProductAnalyticsIngestEvent[]) {
      if (events.length > MAX_BATCH_SIZE) {
        throw new Error("batch_too_large");
      }
      const prepared = events
        .map(prepareIngestEvent)
        .filter((e) => e.eventType !== "page_view" || (e.pageKey != null && e.pageKey !== ""));
      await port.recordEventsBatch(prepared);
    },

    async createPushNotification(row: Parameters<ProductAnalyticsPort["createPushNotification"]>[0]) {
      await port.createPushNotification(row);
    },

    async recordPushOpen(input: RecordPushOpenInput) {
      const entryChannel =
        input.entryChannel && isEntryChannel(input.entryChannel) ? input.entryChannel : "pwa";
      return port.recordPushOpen({
        ...input,
        entryChannel,
        occurredAt: input.occurredAt ?? new Date().toISOString(),
      });
    },

    async getAdminDashboard(params: { windowHours?: number }) {
      const windowHours = clampProductAnalyticsWindowHours(params.windowHours);
      return port.getAdminDashboard({ windowHours });
    },

    async purgeRecentOlderThan(days: number) {
      return port.purgeRecentOlderThan(days);
    },

    async purgeUserHourlyOlderThan(days: number) {
      return port.purgeUserHourlyOlderThan(days);
    },
  };
}

export type ProductAnalyticsService = ReturnType<typeof createProductAnalyticsService>;
