import { eq, lt, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import {
  buildAdminDashboard,
  productAnalyticsWindowStartHour,
  type ProductAnalyticsHourlyRollupRow,
  type WarmupSloganSampleRow,
} from '@/modules/product-analytics/buildAdminDashboard';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { pruneRetentionTarget } from '@/infra/db/pruneRetentionTarget';
import { platformAudienceJson } from '@/infra/repos/pgAnalyticsAudience';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { productAnalyticsPageGroupsJson } from '@/modules/product-analytics/productAnalyticsPageKey';
import {
  hourlyDimsFromEvent,
  shouldUpdateUserHourly,
  truncateToUtcHour,
  userHourlyDeltaFromEvent,
  userHourlyPageKeyForEvent,
} from '@/modules/product-analytics/aggregateKeys';
import type {
  ProductAnalyticsPort,
  ProductAnalyticsPurgeOptions,
} from '@/modules/product-analytics/ports';
import type {
  CreatePushNotificationInput,
  ListRegistrationEventsParams,
  ListRegistrationEventsResult,
  ProductAnalyticsIngestEvent,
  ProductAnalyticsUserAggregates,
  RecordPushOpenInput,
} from '@/modules/product-analytics/types';
import { PRODUCT_ANALYTICS_DIM_ALL } from '@/modules/product-analytics/types';
import {
  productAnalyticsEventsRecent,
  productAnalyticsHourly,
  productPushNotifications,
} from '../../../db/schema/productAnalytics';
import { getWebappSqlDb, runWebappNamedRoot, runWebappSql } from '@/infra/db/runWebappSql';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

function pgErrCode(e: unknown): string | undefined {
  if (typeof e === 'object' && e !== null && 'code' in e) {
    const code = (e as { code?: unknown }).code;
    return typeof code === 'string' ? code : undefined;
  }
  return undefined;
}

function retentionCutoffIso(days: number): string {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
}

async function upsertHourlyCount(
  event: ProductAnalyticsIngestEvent,
  organizationId: string | null,
  increment = 1,
) {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const bucketHour = truncateToUtcHour(occurredAt);
  const dims = hourlyDimsFromEvent(event);
  const now = new Date().toISOString();

  // Conflict target is an index specification, not a value: it is chosen from these two
  // literals here and stays raw.
  const conflict = organizationId
    ? `(organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key) WHERE organization_id IS NOT NULL`
    : `(bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key) WHERE organization_id IS NULL`;
  await runWebappSql(
    getWebappSqlDb(),
    sql`INSERT INTO product_analytics_hourly(
       organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key,event_count,updated_at
     ) VALUES (${organizationId}::uuid,${bucketHour}::timestamptz,${event.eventType},${dims.entryChannel},${dims.pageKey},${dims.topicCode},${dims.pushKind},${dims.warmupSloganKey},${increment},${now}::timestamptz)
     ON CONFLICT ${sql.raw(conflict)} DO UPDATE SET
       event_count=product_analytics_hourly.event_count+EXCLUDED.event_count,
       updated_at=EXCLUDED.updated_at`,
  );
}

async function upsertUserHourly(event: ProductAnalyticsIngestEvent, organizationId: string | null) {
  if (!shouldUpdateUserHourly(event) || !event.userId) return;

  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const bucketHour = truncateToUtcHour(occurredAt);
  const pageKey = userHourlyPageKeyForEvent(event);
  const delta = userHourlyDeltaFromEvent(event);
  const now = new Date().toISOString();

  const conflict = organizationId
    ? `(organization_id,bucket_hour,user_id,entry_channel,page_key) WHERE organization_id IS NOT NULL`
    : `(bucket_hour,user_id,entry_channel,page_key) WHERE organization_id IS NULL`;
  await runWebappSql(
    getWebappSqlDb(),
    sql`INSERT INTO product_analytics_user_hourly(
       organization_id,bucket_hour,user_id,entry_channel,page_key,app_opens,page_views,push_opens,active_minutes,last_seen_at,updated_at
     ) VALUES (${organizationId}::uuid,${bucketHour}::timestamptz,${event.userId}::uuid,${event.entryChannel},${pageKey},${delta.appOpens},${delta.pageViews},${delta.pushOpens},${delta.activeMinutes},${occurredAt}::timestamptz,${now}::timestamptz)
     ON CONFLICT ${sql.raw(conflict)} DO UPDATE SET
       app_opens=product_analytics_user_hourly.app_opens+EXCLUDED.app_opens,
       page_views=product_analytics_user_hourly.page_views+EXCLUDED.page_views,
       push_opens=product_analytics_user_hourly.push_opens+EXCLUDED.push_opens,
       active_minutes=product_analytics_user_hourly.active_minutes+EXCLUDED.active_minutes,
       last_seen_at=GREATEST(product_analytics_user_hourly.last_seen_at,EXCLUDED.last_seen_at),
       updated_at=EXCLUDED.updated_at`,
  );
}

async function insertRecent(
  db: ReturnType<typeof getDrizzle>,
  event: ProductAnalyticsIngestEvent,
  organizationId: string | null,
): Promise<boolean> {
  const occurredAt = event.occurredAt ?? new Date().toISOString();
  const base = {
    organizationId,
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
    if (event.eventType === 'push_open' && event.pushTrackingId && pgErrCode(e) === '23505') {
      return false;
    }
    throw e;
  }
}

function asRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' ? (value as Record<string, unknown>) : {};
}

function asRows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(asRecord) : [];
}

function asCount(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function asText(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function readHourlyRows(value: unknown): ProductAnalyticsHourlyRollupRow[] {
  return asRows(value).map((row) => ({
    bucketHour: asText(row.bucketHour),
    eventType: asText(row.eventType),
    entryChannel: asText(row.entryChannel),
    pageKey: asText(row.pageKey),
    topicCode: asText(row.topicCode),
    pushKind: asText(row.pushKind),
    warmupSloganKey: asText(row.warmupSloganKey),
    eventCount: asCount(row.eventCount),
  }));
}

function readWarmupSloganSamples(value: unknown): WarmupSloganSampleRow[] {
  return asRows(value).map((row) => ({
    sloganKey: asText(row.sloganKey),
    sampleText: typeof row.sampleText === 'string' ? row.sampleText : null,
  }));
}

/** Ни одного идентификатора человека здесь нет и появиться не может: дверь отдаёт только счёт. */
function readUserAggregates(value: unknown): ProductAnalyticsUserAggregates {
  const raw = asRecord(value);
  return {
    totalActiveMinutes: asCount(raw.totalActiveMinutes),
    uniqueActiveUsers: asCount(raw.uniqueActiveUsers),
    activeUsersDaily: asRows(raw.activeUsersDaily).map((row) => ({
      day: asText(row.day),
      activeUsers: asCount(row.activeUsers),
    })),
    pageUniqueUsers: asRows(raw.pageUniqueUsers).map((row) => ({
      pageKey: asText(row.pageKey),
      uniqueUsers: asCount(row.uniqueUsers),
    })),
    pageUniqueUsersHourly: asRows(raw.pageUniqueUsersHourly).map((row) => ({
      bucket: asText(row.bucket),
      pageKey: asText(row.pageKey),
      uniqueUsers: asCount(row.uniqueUsers),
    })),
  };
}

export function createPgProductAnalyticsPort(): ProductAnalyticsPort {
  return {
    async recordEventsBatch(events) {
      const principal = getCurrentDbPrincipal();
      if (principal?.kind === 'patient') {
        for (const event of events) {
          if (event.userId !== principal.platformUserId) {
            throw new Error('patient_analytics_principal_mismatch');
          }
          const occurredAt = event.occurredAt ?? new Date().toISOString();
          const result = await runWithWebappDbOperationFamily('patient_product_analytics', () =>
            runWebappSql<{ recorded: boolean }>(
              getWebappSqlDb(),
              sql`SELECT app.record_current_patient_analytics_event(
                 ${occurredAt}::timestamptz, ${event.eventType}::text, ${event.entryChannel}::text, ${event.pageKey ?? null}::text, ${event.clientSessionId ?? null}::text, ${JSON.stringify(event.metadata ?? {})}::jsonb
               ) AS recorded`,
            ),
          );
          if (result.rows[0]?.recorded !== true) {
            throw new Error('patient_analytics_event_rejected');
          }
        }
        return;
      }
      const db = getDrizzle();
      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      for (const event of events) {
        const inserted = await insertRecent(db, event, organizationId);
        if (!inserted) continue;
        await upsertHourlyCount(event, organizationId);
        await upsertUserHourly(event, organizationId);
      }
    },

    async createPushNotification(row: CreatePushNotificationInput) {
      const db = getDrizzle();
      const createdAt = row.createdAt ?? new Date().toISOString();
      await db.insert(productPushNotifications).values({
        id: row.id,
        organizationId: getCurrentDbPrincipalOrganizationId() ?? null,
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
      await upsertHourlyCount(
        {
          eventType: 'push_sent',
          entryChannel: PRODUCT_ANALYTICS_DIM_ALL as ProductAnalyticsIngestEvent['entryChannel'],
          occurredAt: createdAt,
          topicCode: row.topicCode ?? null,
          pushKind: row.pushKind ?? null,
          warmupSloganKey: row.warmupSloganKey ?? null,
        },
        getCurrentDbPrincipalOrganizationId() ?? null,
      );
    },

    async recordPushOpen(input: RecordPushOpenInput) {
      const principal = getCurrentDbPrincipal();
      if (principal?.kind === 'patient') {
        if (input.userId && input.userId !== principal.platformUserId) {
          throw new Error('patient_analytics_principal_mismatch');
        }
        const result = await runWithWebappDbOperationFamily('patient_product_analytics', () =>
          runWebappSql<{ recorded: boolean; deduped: boolean }>(
            getWebappSqlDb(),
            sql`SELECT recorded, deduped
             FROM app.record_current_patient_push_open(${input.occurredAt ?? new Date().toISOString()}::timestamptz, ${input.entryChannel ?? 'pwa'}::text, ${input.pushTrackingId}::uuid)`,
          ),
        );
        const outcome = result.rows[0];
        if (outcome?.recorded !== true) {
          throw new Error('patient_push_open_rejected');
        }
        return { deduped: outcome.deduped };
      }

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
        eventType: 'push_open',
        entryChannel: input.entryChannel ?? 'pwa',
        occurredAt: input.occurredAt,
        userId: input.userId ?? push?.userId ?? null,
        pushTrackingId: input.pushTrackingId,
        topicCode: push?.topicCode ?? null,
        pushKind: push?.pushKind ?? null,
        warmupSloganKey: push?.warmupSloganKey ?? null,
      };

      const organizationId = getCurrentDbPrincipalOrganizationId() ?? null;
      const inserted = await insertRecent(db, event, organizationId);
      if (!inserted) {
        return { deduped: true };
      }
      await upsertHourlyCount(event, organizationId);
      await upsertUserHourly(event, organizationId);
      return { deduped: false };
    },

    async getAdminDashboard({ windowHours, audience }) {
      const displayTimezone = await getAppDisplayTimeZone();
      const startHour = productAnalyticsWindowStartHour(windowHours);
      const endExclusive = new Date().toISOString();

      // ОДНО обращение вместо четырёх отношенческих чтений. Прежний код читал
      // `product_analytics_events_recent`, `product_push_notifications`,
      // `product_analytics_user_hourly` и `platform_users ⋈ user_identity` (ради ФИО в снятой
      // таблице «Клиент») под `app_platform_settings`. У этой роли на три телеметрические таблицы
      // прав нет вовсе, а на `platform_users` — только `SELECT (id, calendar_timezone)`, поэтому
      // экран отдавал 500 с 42501. Грант не выдаётся (решение владельца Р-АДМИН): дверь отдаёт
      // СЧЁТ, и читать строки людей роли по-прежнему нечем.
      //
      // Идентичность корня пишется ЛИТЕРАЛОМ в самом вызове: каталог call-site читает её из AST, и
      // вынесенная в константу строка для него — «dynamic named-root identity».
      //
      // `excludeStaffRoles: true` — как и раньше на этом экране: он считает продуктовую активность
      // и персонал из неё убирает.
      const args = [
        startHour,
        endExclusive,
        displayTimezone,
        platformAudienceJson(audience, { excludeStaffRoles: true }),
        productAnalyticsPageGroupsJson(),
      ] as const;
      const result = await runWebappNamedRoot<{ snapshot: unknown }>(
        getWebappSqlDb(),
        'app.read_product_analytics_dashboard(timestamp with time zone,timestamp with time zone,text,text,text)',
        args,
        sql`SELECT app.read_product_analytics_dashboard(
          ${sql.param(args[0])}::timestamptz,
          ${sql.param(args[1])}::timestamptz,
          ${sql.param(args[2])}::text,
          ${sql.param(args[3])}::text,
          ${sql.param(args[4])}::text
        ) AS snapshot`,
      );
      const snapshot = asRecord(result.rows[0]?.snapshot);

      return buildAdminDashboard({
        windowHours,
        displayTimezone,
        startHourInclusive: startHour,
        hourlyRows: readHourlyRows(snapshot.hourly),
        userAggregates: readUserAggregates(snapshot.userAggregates),
        warmupSloganSamples: readWarmupSloganSamples(snapshot.warmupSloganSamples),
      });
    },

    // Три таблицы ниже стоят под запертым арендаторским дескриптором: relation-DELETE от роли
    // обслуживания их стену не проходит никогда — у уборки всех клиник организации нет. Уборка
    // идёт единственным объявленным корнем с закрытым списком целей.
    async purgeRecentOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const deleted = await pruneRetentionTarget('product_analytics_events_recent', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },

    async purgeUserHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const deleted = await pruneRetentionTarget('product_analytics_user_hourly', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },

    // `product_analytics_hourly` — единственная из четырёх, что НЕ стоит под запертым
    // дескриптором: у неё обычная деловая политика, и прямой DELETE роли обслуживания её
    // проходит. Здесь ничего не сломано, поэтому она остаётся на своём гранте.
    async purgeHourlyOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const db = getDrizzle();
      const cutoff = retentionCutoffIso(days);
      if (options?.dryRun) {
        const row = await db
          .select({ c: sql<string>`COUNT(*)::text`.as('cnt') })
          .from(productAnalyticsHourly)
          .where(lt(productAnalyticsHourly.bucketHour, cutoff));
        return { deleted: Number.parseInt(row[0]?.c ?? '0', 10) || 0 };
      }
      const deleted = await db
        .delete(productAnalyticsHourly)
        .where(lt(productAnalyticsHourly.bucketHour, cutoff))
        .returning({ bucketHour: productAnalyticsHourly.bucketHour });
      return { deleted: deleted.length };
    },

    async purgePushNotificationsOlderThan(days, options?: ProductAnalyticsPurgeOptions) {
      const deleted = await pruneRetentionTarget('product_push_notifications', days, {
        dryRun: options?.dryRun === true,
      });
      return { deleted };
    },

    async listRegistrationEvents(
      params: ListRegistrationEventsParams,
    ): Promise<ListRegistrationEventsResult> {
      const offset = (params.page - 1) * params.limit;
      const eventType = params.eventType ?? null;
      const errorClass = params.errorClass ?? null;
      const authMethod = params.authMethod?.trim() || null;
      const result = await runWebappNamedRoot<{
        id: string;
        occurred_at: Date | string;
        event_type: string;
        entry_channel: string;
        metadata: Record<string, unknown> | null;
        total_count: string | number;
      }>(
        getWebappSqlDb(),
        'app.list_platform_registration_analytics_events(timestamp with time zone,timestamp with time zone,text,text,text,integer,integer)',
        [
          params.startIso,
          params.endExclusiveIso,
          eventType,
          errorClass,
          authMethod,
          params.limit,
          offset,
        ],
        sql`SELECT id::text AS id, occurred_at, event_type, entry_channel, metadata,
                   total_count::text AS total_count
            FROM app.list_platform_registration_analytics_events(
              ${params.startIso}::timestamptz,
              ${params.endExclusiveIso}::timestamptz,
              ${eventType}::text,
              ${errorClass}::text,
              ${authMethod}::text,
              ${params.limit}::integer,
              ${offset}::integer
            )`,
      );
      const total = Number.parseInt(String(result.rows[0]?.total_count ?? '0'), 10) || 0;

      return {
        items: result.rows.map((row) => ({
          id: row.id,
          occurredAt: toIsoStringSafe(row.occurred_at),
          eventType: row.event_type as ListRegistrationEventsResult['items'][number]['eventType'],
          entryChannel:
            row.entry_channel as ListRegistrationEventsResult['items'][number]['entryChannel'],
          metadata: (row.metadata ?? {}) as Record<string, unknown>,
        })),
        total,
        page: params.page,
        limit: params.limit,
      };
    },
  };
}
