import { and, eq, gte, inArray, isNull, lt, notInArray, or, sql } from "drizzle-orm";
import {
  buildAdminDashboard,
  productAnalyticsWindowStartHour,
} from "@/modules/product-analytics/buildAdminDashboard";
import { getDrizzle } from "@/app-layer/db/drizzle";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";
import { normalizeTestAccountIdentifiersValue } from "@/modules/system-settings/testAccounts";
import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from "@/modules/product-analytics/aggregateKeys";
import type { ProductAnalyticsPort, ProductAnalyticsPurgeOptions } from "@/modules/product-analytics/ports";
import type {
  CreatePushNotificationInput,
  ListRegistrationEventsParams,
  ListRegistrationEventsResult,
  ProductAnalyticsIngestEvent,
  RecordPushOpenInput,
} from "@/modules/product-analytics/types";
import { AUTH_REGISTRATION_EVENT_TYPES } from "@/modules/product-analytics/types";
import { PRODUCT_ANALYTICS_DIM_ALL } from "@/modules/product-analytics/types";
import {
  productAnalyticsEventsRecent,
  productAnalyticsHourly,
  productAnalyticsUserHourly,
  productPushNotifications,
} from "../../../db/schema/productAnalytics";
import { platformUsers, systemSettings, userChannelBindings } from "../../../db/schema/schema";

const STAFF_ANALYTICS_ROLES = ["admin", "doctor"] as const;

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

async function readTestAccountIdentifiers(
  db: ReturnType<typeof getDrizzle>,
): Promise<ReturnType<typeof normalizeTestAccountIdentifiersValue>> {
  const [row] = await db
    .select({ valueJson: systemSettings.valueJson })
    .from(systemSettings)
    .where(and(eq(systemSettings.key, "test_account_identifiers"), eq(systemSettings.scope, "admin")))
    .limit(1);
  if (!row?.valueJson || typeof row.valueJson !== "object") return null;
  const inner = (row.valueJson as Record<string, unknown>).value;
  return normalizeTestAccountIdentifiersValue(inner);
}

async function loadExcludedAnalyticsUserIds(db: ReturnType<typeof getDrizzle>): Promise<string[]> {
  const excluded = new Set<string>();

  const staffRows = await db
    .select({ id: platformUsers.id })
    .from(platformUsers)
    .where(inArray(platformUsers.role, [...STAFF_ANALYTICS_ROLES]));
  for (const row of staffRows) excluded.add(row.id);

  const spec = await readTestAccountIdentifiers(db);
  if (!spec) return [...excluded];

  const phoneRowsPromise =
    spec.phones.length > 0
      ? db
          .select({ id: platformUsers.id })
          .from(platformUsers)
          .where(inArray(platformUsers.phoneNormalized, spec.phones))
      : Promise.resolve([] as Array<{ id: string }>);
  const telegramRowsPromise =
    spec.telegramIds.length > 0
      ? db
          .select({ id: userChannelBindings.userId })
          .from(userChannelBindings)
          .where(
            and(
              eq(userChannelBindings.channelCode, "telegram"),
              inArray(userChannelBindings.externalId, spec.telegramIds),
            ),
          )
      : Promise.resolve([] as Array<{ id: string }>);
  const maxRowsPromise =
    spec.maxIds.length > 0
      ? db
          .select({ id: userChannelBindings.userId })
          .from(userChannelBindings)
          .where(
            and(eq(userChannelBindings.channelCode, "max"), inArray(userChannelBindings.externalId, spec.maxIds)),
          )
      : Promise.resolve([] as Array<{ id: string }>);

  const [phoneRows, telegramRows, maxRows] = await Promise.all([
    phoneRowsPromise,
    telegramRowsPromise,
    maxRowsPromise,
  ]);
  for (const row of phoneRows) excluded.add(row.id);
  for (const row of telegramRows) excluded.add(row.id);
  for (const row of maxRows) excluded.add(row.id);
  return [...excluded];
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
      const displayTimezone = await getAppDisplayTimeZone();
      const startHour = productAnalyticsWindowStartHour(windowHours);
      const excludedUserIds = await loadExcludedAnalyticsUserIds(db);

      const recentEventConditions = [gte(productAnalyticsEventsRecent.occurredAt, startHour)];
      if (excludedUserIds.length > 0) {
        const notExcluded = or(
          isNull(productAnalyticsEventsRecent.userId),
          notInArray(productAnalyticsEventsRecent.userId, excludedUserIds),
        );
        if (notExcluded) recentEventConditions.push(notExcluded);
      }
      const recentRows = await db
        .select({
          occurredAt: productAnalyticsEventsRecent.occurredAt,
          eventType: productAnalyticsEventsRecent.eventType,
          entryChannel: productAnalyticsEventsRecent.entryChannel,
          pageKey: productAnalyticsEventsRecent.pageKey,
          topicCode: productAnalyticsEventsRecent.topicCode,
          pushKind: productAnalyticsEventsRecent.pushKind,
          warmupSloganKey: productAnalyticsEventsRecent.warmupSloganKey,
        })
        .from(productAnalyticsEventsRecent)
        .where(and(...recentEventConditions) ?? recentEventConditions[0]);

      const pushConditions = [gte(productPushNotifications.createdAt, startHour)];
      if (excludedUserIds.length > 0) {
        pushConditions.push(notInArray(productPushNotifications.userId, excludedUserIds));
      }
      const pushRows = await db
        .select({
          createdAt: productPushNotifications.createdAt,
          topicCode: productPushNotifications.topicCode,
          pushKind: productPushNotifications.pushKind,
          warmupSloganKey: productPushNotifications.warmupSloganKey,
          warmupSloganText: productPushNotifications.warmupSloganText,
        })
        .from(productPushNotifications)
        .where(and(...pushConditions) ?? pushConditions[0]);

      const hourlyByKey = new Map<
        string,
        {
          bucketHour: string;
          eventType: string;
          entryChannel: string;
          pageKey: string;
          topicCode: string;
          pushKind: string;
          warmupSloganKey: string;
          eventCount: number;
        }
      >();
      const addHourlyEvent = (event: ProductAnalyticsIngestEvent, increment = 1) => {
        const bucketHour = truncateToUtcHour(event.occurredAt ?? new Date().toISOString());
        const dims = hourlyDimsFromEvent(event);
        const key = [
          bucketHour,
          event.eventType,
          dims.entryChannel,
          dims.pageKey,
          dims.topicCode,
          dims.pushKind,
          dims.warmupSloganKey,
        ].join("|");
        const current = hourlyByKey.get(key);
        if (current) {
          current.eventCount += increment;
          return;
        }
        hourlyByKey.set(key, {
          bucketHour,
          eventType: event.eventType,
          entryChannel: dims.entryChannel,
          pageKey: dims.pageKey,
          topicCode: dims.topicCode,
          pushKind: dims.pushKind,
          warmupSloganKey: dims.warmupSloganKey,
          eventCount: increment,
        });
      };
      for (const row of recentRows) {
        addHourlyEvent({
          eventType: row.eventType as ProductAnalyticsIngestEvent["eventType"],
          entryChannel: row.entryChannel as ProductAnalyticsIngestEvent["entryChannel"],
          occurredAt: row.occurredAt,
          pageKey: row.pageKey,
          topicCode: row.topicCode,
          pushKind: row.pushKind,
          warmupSloganKey: row.warmupSloganKey,
        });
      }
      for (const row of pushRows) {
        addHourlyEvent({
          eventType: "push_sent",
          entryChannel: PRODUCT_ANALYTICS_DIM_ALL as ProductAnalyticsIngestEvent["entryChannel"],
          occurredAt: row.createdAt,
          topicCode: row.topicCode,
          pushKind: row.pushKind,
          warmupSloganKey: row.warmupSloganKey,
        });
      }
      const hourlyRows = [...hourlyByKey.values()];

      const userHourlyConditions = [gte(productAnalyticsUserHourly.bucketHour, startHour)];
      if (excludedUserIds.length > 0) {
        userHourlyConditions.push(notInArray(productAnalyticsUserHourly.userId, excludedUserIds));
      }
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
        .where(and(...userHourlyConditions) ?? userHourlyConditions[0]);

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

      const warmupSamples = pushRows
        .filter((r) => r.pushKind === "warmup" && r.warmupSloganKey != null)
        .map((r) => ({
          sloganKey: r.warmupSloganKey as string,
          sampleText: r.warmupSloganText,
        }));

      return buildAdminDashboard({
        windowHours,
        displayTimezone,
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

    async listRegistrationEvents(params: ListRegistrationEventsParams): Promise<ListRegistrationEventsResult> {
      const db = getDrizzle();
      const excludedUserIds = await loadExcludedAnalyticsUserIds(db);
      const conditions = [
        gte(productAnalyticsEventsRecent.occurredAt, params.startIso),
        lt(productAnalyticsEventsRecent.occurredAt, params.endExclusiveIso),
        inArray(productAnalyticsEventsRecent.eventType, [...AUTH_REGISTRATION_EVENT_TYPES]),
      ];
      if (excludedUserIds.length > 0) {
        const notExcluded = or(
          isNull(productAnalyticsEventsRecent.userId),
          notInArray(productAnalyticsEventsRecent.userId, excludedUserIds),
        );
        if (notExcluded) conditions.push(notExcluded);
      }
      if (params.eventType) {
        conditions.push(eq(productAnalyticsEventsRecent.eventType, params.eventType));
      }
      if (params.authMethod?.trim()) {
        conditions.push(sql`${productAnalyticsEventsRecent.metadata}->>'authMethod' = ${params.authMethod.trim()}`);
      }
      if (params.errorClass) {
        conditions.push(sql`${productAnalyticsEventsRecent.metadata}->>'errorClass' = ${params.errorClass}`);
      }
      const whereClause = and(...conditions);
      const offset = (params.page - 1) * params.limit;

      const [countRow] = await db
        .select({ c: sql<string>`COUNT(*)::text`.as("cnt") })
        .from(productAnalyticsEventsRecent)
        .where(whereClause);
      const total = Number.parseInt(countRow?.c ?? "0", 10) || 0;

      const rows = await db
        .select({
          id: productAnalyticsEventsRecent.id,
          occurredAt: productAnalyticsEventsRecent.occurredAt,
          eventType: productAnalyticsEventsRecent.eventType,
          entryChannel: productAnalyticsEventsRecent.entryChannel,
          userId: productAnalyticsEventsRecent.userId,
          metadata: productAnalyticsEventsRecent.metadata,
        })
        .from(productAnalyticsEventsRecent)
        .where(whereClause)
        .orderBy(sql`${productAnalyticsEventsRecent.occurredAt} DESC`)
        .limit(params.limit)
        .offset(offset);

      return {
        items: rows.map((row) => ({
          id: row.id,
          occurredAt: row.occurredAt,
          eventType: row.eventType as ListRegistrationEventsResult["items"][number]["eventType"],
          entryChannel: row.entryChannel as ListRegistrationEventsResult["items"][number]["entryChannel"],
          userId: row.userId,
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        })),
        total,
        page: params.page,
        limit: params.limit,
      };
    },
  };
}
