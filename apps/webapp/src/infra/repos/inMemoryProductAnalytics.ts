import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from "@/modules/product-analytics/aggregateKeys";
import type { ProductAnalyticsPort } from "@/modules/product-analytics/ports";
import type {
  CreatePushNotificationInput,
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";
type HourlyKey = string;
type UserHourlyKey = string;

function hourlyKey(
  bucketHour: string,
  eventType: string,
  entryChannel: string,
  pageKey: string,
  topicCode: string,
  pushKind: string,
  warmupSloganKey: string,
): HourlyKey {
  return [bucketHour, eventType, entryChannel, pageKey, topicCode, pushKind, warmupSloganKey].join("\0");
}

function userHourlyKey(bucketHour: string, userId: string, entryChannel: string, pageKey: string): UserHourlyKey {
  return [bucketHour, userId, entryChannel, pageKey].join("\0");
}

function emptyDashboard(windowHours: number): ProductAnalyticsAdminDashboard {
  return {
    windowHours,
    generatedAt: new Date().toISOString(),
    summary: {
      uniqueActiveUsers: 0,
      totalAppOpens: 0,
      totalPageViews: 0,
      totalPushOpens: 0,
      pushOpenRate: 0,
    },
    entryChannelHourly: [],
    topPages: [],
    pushByTopic: [],
    warmupSlogans: [],
    activeUsersDaily: [],
  };
}

export function createInMemoryProductAnalyticsPort(): ProductAnalyticsPort {
  const recent: Array<{ id: string } & ProductAnalyticsIngestEvent & { occurredAt: string }> = [];
  const pushOpenTrackingIds = new Set<string>();
  const pushNotifications = new Map<string, CreatePushNotificationInput>();
  const hourly = new Map<HourlyKey, number>();
  const userHourly = new Map<
    UserHourlyKey,
    {
      appOpens: number;
      pageViews: number;
      pushOpens: number;
      activeMinutes: number;
      lastSeenAt: string | null;
    }
  >();

  function bumpHourly(event: ProductAnalyticsIngestEvent, count = 1) {
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    const bucketHour = truncateToUtcHour(occurredAt);
    const dims = hourlyDimsFromEvent(event);
    const key = hourlyKey(
      bucketHour,
      event.eventType,
      dims.entryChannel,
      dims.pageKey,
      dims.topicCode,
      dims.pushKind,
      dims.warmupSloganKey,
    );
    hourly.set(key, (hourly.get(key) ?? 0) + count);
  }

  function bumpUserHourly(event: ProductAnalyticsIngestEvent) {
    if (!shouldUpdateUserHourly(event) || !event.userId) return;
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    const bucketHour = truncateToUtcHour(occurredAt);
    const pageKey = userHourlyPageKeyForEvent(event);
    const key = userHourlyKey(bucketHour, event.userId, event.entryChannel, pageKey);
    const delta = userHourlyDeltaFromEvent(event);
    const cur = userHourly.get(key) ?? {
      appOpens: 0,
      pageViews: 0,
      pushOpens: 0,
      activeMinutes: 0,
      lastSeenAt: null,
    };
    userHourly.set(key, {
      appOpens: cur.appOpens + delta.appOpens,
      pageViews: cur.pageViews + delta.pageViews,
      pushOpens: cur.pushOpens + delta.pushOpens,
      activeMinutes: cur.activeMinutes + delta.activeMinutes,
      lastSeenAt: occurredAt,
    });
  }

  function ingestOne(event: ProductAnalyticsIngestEvent, opts?: { skipRecent?: boolean }) {
    const occurredAt = event.occurredAt ?? new Date().toISOString();
    if (!opts?.skipRecent) {
      recent.push({ id: crypto.randomUUID(), ...event, occurredAt });
    }
    bumpHourly(event);
    bumpUserHourly(event);
  }

  return {
    async recordEventsBatch(events) {
      for (const event of events) {
        if (event.eventType === "push_open" && event.pushTrackingId) {
          if (pushOpenTrackingIds.has(event.pushTrackingId)) continue;
          pushOpenTrackingIds.add(event.pushTrackingId);
        }
        ingestOne(event);
      }
    },

    async createPushNotification(row) {
      pushNotifications.set(row.id, row);
    },

    async recordPushOpen(input: RecordPushOpenInput) {
      if (pushOpenTrackingIds.has(input.pushTrackingId)) {
        return { deduped: true };
      }
      const push = pushNotifications.get(input.pushTrackingId);
      const event: ProductAnalyticsIngestEvent = {
        eventType: "push_open",
        entryChannel: input.entryChannel ?? "pwa",
        occurredAt: input.occurredAt,
        userId: input.userId ?? null,
        pushTrackingId: input.pushTrackingId,
        topicCode: push?.topicCode ?? null,
        pushKind: push?.pushKind ?? null,
        warmupSloganKey: push?.warmupSloganKey ?? null,
      };
      pushOpenTrackingIds.add(input.pushTrackingId);
      ingestOne(event);
      return { deduped: false };
    },

    async getAdminDashboard({ windowHours }) {
      return emptyDashboard(windowHours);
    },

    async purgeRecentOlderThan(days) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      const before = recent.length;
      for (let i = recent.length - 1; i >= 0; i--) {
        const row = recent[i]!;
        if (new Date(row.occurredAt).getTime() < cutoff) {
          recent.splice(i, 1);
        }
      }
      return { deleted: before - recent.length };
    },

    async purgeUserHourlyOlderThan(_days) {
      return { deleted: 0 };
    },
  };
}
