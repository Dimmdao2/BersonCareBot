import type { ProductAnalyticsIngestEvent } from "@/modules/product-analytics/types";
import { PRODUCT_ANALYTICS_DIM_ALL } from "@/modules/product-analytics/types";

export function truncateToUtcHour(iso: string): string {
  const d = new Date(iso);
  d.setUTCMinutes(0, 0, 0);
  return d.toISOString();
}

export function hourlyDimsFromEvent(event: ProductAnalyticsIngestEvent) {
  return {
    entryChannel: event.entryChannel,
    pageKey: event.pageKey ?? PRODUCT_ANALYTICS_DIM_ALL,
    topicCode: event.topicCode ?? PRODUCT_ANALYTICS_DIM_ALL,
    pushKind: event.pushKind ?? PRODUCT_ANALYTICS_DIM_ALL,
    warmupSloganKey: event.warmupSloganKey ?? PRODUCT_ANALYTICS_DIM_ALL,
  };
}

export type UserHourlyCounterDelta = {
  appOpens: number;
  pageViews: number;
  pushOpens: number;
  activeMinutes: number;
};

export function userHourlyDeltaFromEvent(event: ProductAnalyticsIngestEvent): UserHourlyCounterDelta {
  switch (event.eventType) {
    case "app_open":
      return { appOpens: 1, pageViews: 0, pushOpens: 0, activeMinutes: 0 };
    case "page_view":
      return { appOpens: 0, pageViews: 1, pushOpens: 0, activeMinutes: 0 };
    case "push_open":
      return { appOpens: 0, pageViews: 0, pushOpens: 1, activeMinutes: 0 };
    case "heartbeat":
      return { appOpens: 0, pageViews: 0, pushOpens: 0, activeMinutes: 1 };
    default:
      return { appOpens: 0, pageViews: 0, pushOpens: 0, activeMinutes: 0 };
  }
}

export function userHourlyPageKeyForEvent(event: ProductAnalyticsIngestEvent): string {
  if (event.eventType === "app_open") return PRODUCT_ANALYTICS_DIM_ALL;
  if (event.eventType === "page_view" && event.pageKey) return event.pageKey;
  if (event.eventType === "push_open" || event.eventType === "heartbeat") return PRODUCT_ANALYTICS_DIM_ALL;
  return PRODUCT_ANALYTICS_DIM_ALL;
}

export function shouldUpdateUserHourly(event: ProductAnalyticsIngestEvent): boolean {
  if (!event.userId) return false;
  return (
    event.eventType === "app_open" ||
    event.eventType === "page_view" ||
    event.eventType === "push_open" ||
    event.eventType === "heartbeat"
  );
}
