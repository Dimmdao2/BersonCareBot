import { eq, lt, sql } from "drizzle-orm";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from "@/modules/product-analytics/aggregateKeys";
import type { ProductAnalyticsPort } from "@/modules/product-analytics/ports";
import type {
  ProductAnalyticsAdminDashboard,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";
import {
  productAnalyticsEventsRecent,
  productAnalyticsHourly,
  productAnalyticsUserHourly,
  productPushNotifications,
} from "../../../db/schema/productAnalytics";

function pgErrCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
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

async function upsertHourlyCount(
  db: ReturnType<typeof getDrizzle>,
  event: ProductAnalyticsIngestEvent,
  increment = 1,
) {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const bucketHour = truncateToUtcHour(occurredAt);
  const dims = hourlyDimsFromEvent(event);
  const now = new Date().toISOString();

  await db
    .insert(productAnalyticsHourly)
    .values({
      bucketHour,
      eventType: event.eventType,
      entryChannel: dims.entryChannel,
      pageKey: dims.pageKey,
      topicCode: dims.topicCode,
      pushKind: dims.pushKind,
      warmupSloganKey: dims.warmupSloganKey,
      eventCount: increment,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        productAnalyticsHourly.bucketHour,
        productAnalyticsHourly.eventType,
        productAnalyticsHourly.entryChannel,
        productAnalyticsHourly.pageKey,
        productAnalyticsHourly.topicCode,
        productAnalyticsHourly.pushKind,
        productAnalyticsHourly.warmupSloganKey,
      ],
      set: {
        eventCount: sql`${productAnalyticsHourly.eventCount} + ${increment}`,
        updatedAt: now,
      },
    });
}

async function upsertUserHourly(db: ReturnType<typeof getDrizzle>, event: ProductAnalyticsIngestEvent) {
  if (!shouldUpdateUserHourly(event) || !event.userId) return;

  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const bucketHour = truncateToUtcHour(occurredAt);
  const pageKey = userHourlyPageKeyForEvent(event);
  const delta = userHourlyDeltaFromEvent(event);
  const now = new Date().toISOString();

  await db
    .insert(productAnalyticsUserHourly)
    .values({
      bucketHour,
      userId: event.userId,
      entryChannel: event.entryChannel,
      pageKey,
      appOpens: delta.appOpens,
      pageViews: delta.pageViews,
      pushOpens: delta.pushOpens,
      activeMinutes: delta.activeMinutes,
      lastSeenAt: occurredAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: [
        productAnalyticsUserHourly.bucketHour,
        productAnalyticsUserHourly.userId,
        productAnalyticsUserHourly.entryChannel,
        productAnalyticsUserHourly.pageKey,
      ],
      set: {
        appOpens: sql`${productAnalyticsUserHourly.appOpens} + ${delta.appOpens}`,
        pageViews: sql`${productAnalyticsUserHourly.pageViews} + ${delta.pageViews}`,
        pushOpens: sql`${productAnalyticsUserHourly.pushOpens} + ${delta.pushOpens}`,
        activeMinutes: sql`${productAnalyticsUserHourly.activeMinutes} + ${delta.activeMinutes}`,
        lastSeenAt: occurredAt,
        updatedAt: now,
      },
    });
}

async function insertRecent(
  db: ReturnType<typeof getDrizzle>,
  event: ProductAnalyticsIngestEvent,
): Promise<boolean> {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const base = {
    occurredAt,
    eventType: event.eventType,
    entryChannel: event.entryChannel,
    pageKey: event.pageKey ?? null,
    userId: event.userId ?? null,
    clientSessionId: event.clientSessionId ?? null,
    pushTrackingId: event.pushTrackingId ?? null,
    topicCode: event.topicCode ?? null,
    pushKind: event.pushKind ?? null,
    warmupSloganKey: event.warmupSloganKey ?? null,
    metadata: event.metadata ?? {},
  };

  try {
    await db.insert(productAnalyticsEventsRecent).values(base);
    return true;
  } catch (e: unknown) {
    if (event.eventType === "push_open" && event.pushTrackingId && pgErrCode(e) === "23505") {
      return false;
    }
    throw e;
  }
}

export function createPgProductAnalyticsPort(): ProductAnalyticsPort {
  return {
    async recordEventsBatch(events) {
      const db = getDrizzle();
      for (const event of events) {
        const inserted = await insertRecent(db, event);
        if (!inserted) continue;
        await upsertHourlyCount(db, event);
        await upsertUserHourly(db, event);
      }
    },

    async createPushNotification(row) {
      const db = getDrizzle();
      await db.insert(productPushNotifications).values({
        id: row.id,
        userId: row.userId,
        topicCode: row.topicCode ?? null,
        intentType: row.intentType ?? null,
        occurrenceId: row.occurrenceId ?? null,
        pushKind: row.pushKind ?? null,
        warmupSloganKey: row.warmupSloganKey ?? null,
        warmupSloganText: row.warmupSloganText ?? null,
        openUrl: row.openUrl ?? null,
        title: row.title ?? null,
        createdAt: row.createdAt ?? new Date().toISOString(),
      });
    },

    async recordPushOpen(input: RecordPushOpenInput) {
      const db = getDrizzle();
      const [push] = await db
        .select({
          topicCode: productPushNotifications.topicCode,
          pushKind: productPushNotifications.pushKind,
          warmupSloganKey: productPushNotifications.warmupSloganKey,
        })
        .from(productPushNotifications)
        .where(eq(productPushNotifications.id, input.pushTrackingId))
        .limit(1);

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

      const inserted = await insertRecent(db, event);
      if (!inserted) {
        return { deduped: true };
      }
      await upsertHourlyCount(db, event);
      await upsertUserHourly(db, event);
      return { deduped: false };
    },

    async getAdminDashboard({ windowHours }) {
      return emptyDashboard(windowHours);
    },

    async purgeRecentOlderThan(days) {
      const db = getDrizzle();
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const deleted = await db
        .delete(productAnalyticsEventsRecent)
        .where(lt(productAnalyticsEventsRecent.occurredAt, cutoff))
        .returning({ id: productAnalyticsEventsRecent.id });
      return { deleted: deleted.length };
    },

    async purgeUserHourlyOlderThan(days) {
      const db = getDrizzle();
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
      const deleted = await db
        .delete(productAnalyticsUserHourly)
        .where(lt(productAnalyticsUserHourly.bucketHour, cutoff))
        .returning({
          userId: productAnalyticsUserHourly.userId,
        });
      return { deleted: deleted.length };
    },
  };
}
