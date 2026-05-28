import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  buildAdminDashboard,
  productAnalyticsWindowStartHour,
} from "@/modules/product-analytics/buildAdminDashboard";
import { getDrizzle } from "@/app-layer/db/drizzle";
import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from "@/modules/product-analytics/aggregateKeys";
import type { ProductAnalyticsPort, ProductAnalyticsPurgeOptions } from "@/modules/product-analytics/ports";
import type { ProductAnalyticsIngestEvent, RecordPushOpenInput } from "@/modules/product-analytics/types";
import { PRODUCT_ANALYTICS_DIM_ALL } from "@/modules/product-analytics/types";
import {
  productAnalyticsEventsRecent,
  productAnalyticsHourly,
  productAnalyticsUserHourly,
  productPushNotifications,
} from "../../../db/schema/productAnalytics";
import { platformUsers } from "../../../db/schema/schema";
import type { CreatePushNotificationInput } from "@/modules/product-analytics/types";

function pgErrCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === "string" ? code : undefined;
  }
  return undefined;
}

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
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

    async createPushNotification(row: CreatePushNotificationInput) {
      const db = getDrizzle();
      const createdAt = row.createdAt ?? new Date().toISOString();
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
        createdAt,
      });
      await upsertHourlyCount(db, {
        eventType: "push_sent",
        entryChannel: PRODUCT_ANALYTICS_DIM_ALL as ProductAnalyticsIngestEvent["entryChannel"],
        occurredAt: createdAt,
        topicCode: row.topicCode ?? null,
        pushKind: row.pushKind ?? null,
        warmupSloganKey: row.warmupSloganKey ?? null,
      });
    },

    async recordPushOpen(input: RecordPushOpenInput) {
      const db = getDrizzle();
      const [push] = await db
        .select({
          userId: productPushNotifications.userId,
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
        userId: input.userId ?? push?.userId ?? null,
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
      const db = getDrizzle();
      const startHour = productAnalyticsWindowStartHour(windowHours);
      const startIso = new Date(Date.now() - windowHours * 60 * 60 * 1000).toISOString();

      const hourlyRows = await db
        .select({
          bucketHour: productAnalyticsHourly.bucketHour,
          eventType: productAnalyticsHourly.eventType,
          entryChannel: productAnalyticsHourly.entryChannel,
          pageKey: productAnalyticsHourly.pageKey,
          topicCode: productAnalyticsHourly.topicCode,
          pushKind: productAnalyticsHourly.pushKind,
          warmupSloganKey: productAnalyticsHourly.warmupSloganKey,
          eventCount: productAnalyticsHourly.eventCount,
        })
        .from(productAnalyticsHourly)
        .where(gte(productAnalyticsHourly.bucketHour, startHour));

      const userHourlyRows = await db
        .select({
          bucketHour: productAnalyticsUserHourly.bucketHour,
          userId: productAnalyticsUserHourly.userId,
          entryChannel: productAnalyticsUserHourly.entryChannel,
          pageKey: productAnalyticsUserHourly.pageKey,
          appOpens: productAnalyticsUserHourly.appOpens,
          pageViews: productAnalyticsUserHourly.pageViews,
          pushOpens: productAnalyticsUserHourly.pushOpens,
          activeMinutes: productAnalyticsUserHourly.activeMinutes,
          lastSeenAt: productAnalyticsUserHourly.lastSeenAt,
        })
        .from(productAnalyticsUserHourly)
        .where(gte(productAnalyticsUserHourly.bucketHour, startHour));

      const userIds = [...new Set(userHourlyRows.map((r) => r.userId))];
      const userDisplayNames: Record<string, string> = {};
      if (userIds.length > 0) {
        const userRows = await db
          .select({
            id: platformUsers.id,
            displayName: platformUsers.displayName,
            firstName: platformUsers.firstName,
            lastName: platformUsers.lastName,
          })
          .from(platformUsers)
          .where(inArray(platformUsers.id, userIds));
        for (const row of userRows) {
          const firstLast = [row.firstName?.trim(), row.lastName?.trim()].filter(Boolean).join(" ").trim();
          const displayName = row.displayName?.trim() || firstLast || "Пациент";
          userDisplayNames[row.id] = displayName;
        }
      }

      const warmupSamples = await db
        .select({
          sloganKey: productPushNotifications.warmupSloganKey,
          sampleText: productPushNotifications.warmupSloganText,
        })
        .from(productPushNotifications)
        .where(
          and(
            gte(productPushNotifications.createdAt, startIso),
            eq(productPushNotifications.pushKind, "warmup"),
            isNotNull(productPushNotifications.warmupSloganKey),
          ),
        );

      return buildAdminDashboard({
        windowHours,
        startHourInclusive: startHour,
        hourlyRows,
        userHourlyRows,
        userDisplayNames,
        warmupSloganSamples: warmupSamples
          .filter((r): r is { sloganKey: string; sampleText: string | null } => r.sloganKey != null)
          .map((r) => ({ sloganKey: r.sloganKey, sampleText: r.sampleText })),
      });
    },

    async purgeRecentOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const db = getDrizzle();
      const cutoff = retentionCutoffIso(days);
      if (options?.dryRun) {
        const row = await db
          .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
          .from(productAnalyticsEventsRecent)
          .where(lt(productAnalyticsEventsRecent.occurredAt, cutoff));
        return { deleted: Number.parseInt(row[0]?.c ?? "0", 10) || 0 };
      }
      const deleted = await db
        .delete(productAnalyticsEventsRecent)
        .where(lt(productAnalyticsEventsRecent.occurredAt, cutoff))
        .returning({ id: productAnalyticsEventsRecent.id });
      return { deleted: deleted.length };
    },

    async purgeUserHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const db = getDrizzle();
      const cutoff = retentionCutoffIso(days);
      if (options?.dryRun) {
        const row = await db
          .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
          .from(productAnalyticsUserHourly)
          .where(lt(productAnalyticsUserHourly.bucketHour, cutoff));
        return { deleted: Number.parseInt(row[0]?.c ?? "0", 10) || 0 };
      }
      const deleted = await db
        .delete(productAnalyticsUserHourly)
        .where(lt(productAnalyticsUserHourly.bucketHour, cutoff))
        .returning({ userId: productAnalyticsUserHourly.userId });
      return { deleted: deleted.length };
    },

    async purgeHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const db = getDrizzle();
      const cutoff = retentionCutoffIso(days);
      if (options?.dryRun) {
        const row = await db
          .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
          .from(productAnalyticsHourly)
          .where(lt(productAnalyticsHourly.bucketHour, cutoff));
        return { deleted: Number.parseInt(row[0]?.c ?? "0", 10) || 0 };
      }
      const deleted = await db
        .delete(productAnalyticsHourly)
        .where(lt(productAnalyticsHourly.bucketHour, cutoff))
        .returning({ bucketHour: productAnalyticsHourly.bucketHour });
      return { deleted: deleted.length };
    },

    async purgePushNotificationsOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const db = getDrizzle();
      const cutoff = retentionCutoffIso(days);
      if (options?.dryRun) {
        const row = await db
          .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
          .from(productPushNotifications)
          .where(lt(productPushNotifications.createdAt, cutoff));
        return { deleted: Number.parseInt(row[0]?.c ?? "0", 10) || 0 };
      }
      const deleted = await db
        .delete(productPushNotifications)
        .where(lt(productPushNotifications.createdAt, cutoff))
        .returning({ id: productPushNotifications.id });
      return { deleted: deleted.length };
    },
  };
}
