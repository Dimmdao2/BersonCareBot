import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from "@/modules/product-analytics/aggregateKeys";
import {
  buildAdminDashboard,
  productAnalyticsWindowStartHour,
} from "@/modules/product-analytics/buildAdminDashboard";
import type { ProductAnalyticsPort, ProductAnalyticsPurgeOptions } from "@/modules/product-analytics/ports";
import type {
  CreatePushNotificationInput,
  ListRegistrationEventsParams,
  ListRegistrationEventsResult,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";
import { AUTH_REGISTRATION_EVENT_TYPES, PRODUCT_ANALYTICS_DIM_ALL } from "@/modules/product-analytics/types";
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
      ingestOne({
        eventType: "push_sent",
        entryChannel: PRODUCT_ANALYTICS_DIM_ALL as ProductAnalyticsIngestEvent["entryChannel"],
        occurredAt: row.createdAt,
        topicCode: row.topicCode ?? null,
        pushKind: row.pushKind ?? null,
        warmupSloganKey: row.warmupSloganKey ?? null,
      });
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
        userId: input.userId ?? push?.userId ?? null,
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
      const startHour = productAnalyticsWindowStartHour(windowHours);
      const hourlyRows = [...hourly.entries()].map(([key, eventCount]) => {
        const [bucketHour, eventType, entryChannel, pageKey, topicCode, pushKind, warmupSloganKey] =
          key.split("\0");
        return {
          bucketHour: bucketHour!,
          eventType: eventType!,
          entryChannel: entryChannel!,
          pageKey: pageKey!,
          topicCode: topicCode!,
          pushKind: pushKind!,
          warmupSloganKey: warmupSloganKey!,
          eventCount,
        };
      });
      const userHourlyRows = [...userHourly.entries()].map(([key, counters]) => {
        const [bucketHour, userId, entryChannel, pageKey] = key.split("\0");
        return {
          bucketHour: bucketHour!,
          userId: userId!,
          entryChannel: entryChannel!,
          pageKey: pageKey!,
          ...counters,
        };
      });
      const windowStartMs = new Date(startHour).getTime();
      const warmupSloganSamples = [...pushNotifications.values()]
        .filter((p) => {
          if (p.pushKind !== "warmup" || !p.warmupSloganKey) return false;
          if (!p.createdAt) return true;
          return new Date(p.createdAt).getTime() >= windowStartMs;
        })
        .map((p) => ({
          sloganKey: p.warmupSloganKey!,
          sampleText: p.warmupSloganText ?? null,
        }));
      return buildAdminDashboard({
        windowHours,
        displayTimezone: "Europe/Moscow",
        startHourInclusive: startHour,
        hourlyRows,
        userHourlyRows,
        warmupSloganSamples,
      });
    },

    async purgeRecentOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
      let matched = 0;
      for (const row of recent) {
        if (new Date(row.occurredAt).getTime() < cutoff) matched++;
      }
      if (options?.dryRun) return { deleted: matched };
      const before = recent.length;
      for (let i = recent.length - 1; i >= 0; i--) {
        const row = recent[i]!;
        if (new Date(row.occurredAt).getTime() < cutoff) {
          recent.splice(i, 1);
        }
      }
      return { deleted: before - recent.length };
    },

    async purgeUserHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const keys = [...userHourly.keys()].filter((k) => {
        const bucketHour = k.split("\0")[0]!;
        return new Date(bucketHour).getTime() < cutoffMs;
      });
      if (options?.dryRun) return { deleted: keys.length };
      for (const k of keys) userHourly.delete(k);
      return { deleted: keys.length };
    },

    async purgeHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const keys = [...hourly.keys()].filter((k) => {
        const bucketHour = k.split("\0")[0]!;
        return new Date(bucketHour).getTime() < cutoffMs;
      });
      if (options?.dryRun) return { deleted: keys.length };
      for (const k of keys) hourly.delete(k);
      return { deleted: keys.length };
    },

    async purgePushNotificationsOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const cutoffMs = Date.now() - days * 24 * 60 * 60 * 1000;
      const ids: string[] = [];
      for (const [id, row] of pushNotifications) {
        const at = row.createdAt ? new Date(row.createdAt).getTime() : 0;
        if (at < cutoffMs) ids.push(id);
      }
      if (options?.dryRun) return { deleted: ids.length };
      for (const id of ids) pushNotifications.delete(id);
      return { deleted: ids.length };
    },

    async listRegistrationEvents(params: ListRegistrationEventsParams): Promise<ListRegistrationEventsResult> {
      const startMs = new Date(params.startIso).getTime();
      const endMs = new Date(params.endExclusiveIso).getTime();
      let filtered = recent.filter((row) => {
        const t = new Date(row.occurredAt).getTime();
        if (t < startMs || t >= endMs) return false;
        if (!(AUTH_REGISTRATION_EVENT_TYPES as readonly string[]).includes(row.eventType)) return false;
        if (params.eventType && row.eventType !== params.eventType) return false;
        const meta = row.metadata ?? {};
        if (params.authMethod?.trim() && meta.authMethod !== params.authMethod.trim()) return false;
        if (params.errorClass && meta.errorClass !== params.errorClass) return false;
        return true;
      });
      filtered = [...filtered].sort(
        (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime(),
      );
      const total = filtered.length;
      const offset = (params.page - 1) * params.limit;
      const pageItems = filtered.slice(offset, offset + params.limit);
      return {
        items: pageItems.map((row) => ({
          id: row.id,
          occurredAt: row.occurredAt,
          eventType: row.eventType as ListRegistrationEventsResult["items"][number]["eventType"],
          entryChannel: row.entryChannel as ListRegistrationEventsResult["items"][number]["entryChannel"],
          userId: row.userId ?? null,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        })),
        total,
        page: params.page,
        limit: params.limit,
      };
    },
  };
}
