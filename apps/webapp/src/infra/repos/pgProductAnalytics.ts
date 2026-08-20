import { and, eq, gte, inArray, isNull, lt, notInArray, or, sql } from 'drizzle-orm';
import {
  getCurrentDbPrincipal,
  getCurrentDbPrincipalOrganizationId,
} from '@bersoncare/db-principal';
import {
  buildAdminDashboard,
  productAnalyticsWindowStartHour,
} from '@/modules/product-analytics/buildAdminDashboard';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { pruneRetentionTarget } from '@/infra/db/pruneRetentionTarget';
import { resolveAnalyticsExcludedUserIds } from '@/infra/repos/pgAnalyticsAudience';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { getServerConfigStructuredValue } from '@/modules/system-settings/configAdapter';
import {
  normalizeTestAccountIdentifiersValue,
  type TestAccountIdentifiers,
} from '@/modules/system-settings/testAccounts';
import { drizzleFioCols, drizzleUserIdentityFioJoin } from '@/infra/repos/userIdentityFioSql';
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
  RecordPushOpenInput,
} from '@/modules/product-analytics/types';
import { PRODUCT_ANALYTICS_DIM_ALL } from '@/modules/product-analytics/types';
import {
  productAnalyticsEventsRecent,
  productAnalyticsHourly,
  productAnalyticsUserHourly,
  productPushNotifications,
} from '../../../db/schema/productAnalytics';
import { platformUsers, userIdentity } from '../../../db/schema/schema';
import {
  getWebappSqlDb,
  runWebappNamedRoot,
  runWebappPgText,
} from '@/infra/db/runWebappSql';
import { runWithWebappDbOperationFamily } from '@/infra/db/saasIsolationOperationContext';
import { toIsoStringSafe } from '@/shared/lib/toIsoStringSafe';

async function loadProductAnalyticsTestAccountIdentifiers(): Promise<TestAccountIdentifiers | null> {
  return normalizeTestAccountIdentifiersValue(
    await getServerConfigStructuredValue('test_account_identifiers'),
  );
}

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

  const conflict = organizationId
    ? `(organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key) WHERE organization_id IS NOT NULL`
    : `(bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key) WHERE organization_id IS NULL`;
  await runWebappPgText(
    `INSERT INTO product_analytics_hourly(
       organization_id,bucket_hour,event_type,entry_channel,page_key,topic_code,push_kind,warmup_slogan_key,event_count,updated_at
     ) VALUES ($1::uuid,$2::timestamptz,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz)
     ON CONFLICT ${conflict} DO UPDATE SET
       event_count=product_analytics_hourly.event_count+EXCLUDED.event_count,
       updated_at=EXCLUDED.updated_at`,
    [
      organizationId,
      bucketHour,
      event.eventType,
      dims.entryChannel,
      dims.pageKey,
      dims.topicCode,
      dims.pushKind,
      dims.warmupSloganKey,
      increment,
      now,
    ],
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
  await runWebappPgText(
    `INSERT INTO product_analytics_user_hourly(
       organization_id,bucket_hour,user_id,entry_channel,page_key,app_opens,page_views,push_opens,active_minutes,last_seen_at,updated_at
     ) VALUES ($1::uuid,$2::timestamptz,$3::uuid,$4,$5,$6,$7,$8,$9,$10::timestamptz,$11::timestamptz)
     ON CONFLICT ${conflict} DO UPDATE SET
       app_opens=product_analytics_user_hourly.app_opens+EXCLUDED.app_opens,
       page_views=product_analytics_user_hourly.page_views+EXCLUDED.page_views,
       push_opens=product_analytics_user_hourly.push_opens+EXCLUDED.push_opens,
       active_minutes=product_analytics_user_hourly.active_minutes+EXCLUDED.active_minutes,
       last_seen_at=GREATEST(product_analytics_user_hourly.last_seen_at,EXCLUDED.last_seen_at),
       updated_at=EXCLUDED.updated_at`,
    [
      organizationId,
      bucketHour,
      event.userId,
      event.entryChannel,
      pageKey,
      delta.appOpens,
      delta.pageViews,
      delta.pushOpens,
      delta.activeMinutes,
      occurredAt,
      now,
    ],
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
            runWebappPgText<{ recorded: boolean }>(
              `SELECT app.record_current_patient_analytics_event(
                 $1::timestamptz, $2::text, $3::text, $4::text, $5::text, $6::jsonb
               ) AS recorded`,
              [
                occurredAt,
                event.eventType,
                event.entryChannel,
                event.pageKey ?? null,
                event.clientSessionId ?? null,
                JSON.stringify(event.metadata ?? {}),
              ],
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
          runWebappPgText<{ recorded: boolean; deduped: boolean }>(
            `SELECT recorded, deduped
             FROM app.record_current_patient_push_open($1::timestamptz, $2::text, $3::uuid)`,
            [
              input.occurredAt ?? new Date().toISOString(),
              input.entryChannel ?? 'pwa',
              input.pushTrackingId,
            ],
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

    async getAdminDashboard({ windowHours, includeTestAccounts = false }) {
      const db = getDrizzle();
      const displayTimezone = await getAppDisplayTimeZone();
      const startHour = productAnalyticsWindowStartHour(windowHours);
      const excludedUserIds = await resolveAnalyticsExcludedUserIds(db, {
        includeTestAccounts,
        excludeStaffRoles: true,
        testAccountIdentifiers: includeTestAccounts
          ? null
          : await loadProductAnalyticsTestAccountIdentifiers(),
      });

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
        ].join('|');
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
          eventType: row.eventType as ProductAnalyticsIngestEvent['eventType'],
          entryChannel: row.entryChannel as ProductAnalyticsIngestEvent['entryChannel'],
          occurredAt: row.occurredAt,
          pageKey: row.pageKey,
          topicCode: row.topicCode,
          pushKind: row.pushKind,
          warmupSloganKey: row.warmupSloganKey,
        });
      }
      for (const row of pushRows) {
        addHourlyEvent({
          eventType: 'push_sent',
          entryChannel: PRODUCT_ANALYTICS_DIM_ALL as ProductAnalyticsIngestEvent['entryChannel'],
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
            displayName: drizzleFioCols.displayName,
            firstName: drizzleFioCols.firstName,
            lastName: drizzleFioCols.lastName,
          })
          .from(platformUsers)
          .leftJoin(userIdentity, drizzleUserIdentityFioJoin)
          .where(inArray(platformUsers.id, userIds));
        for (const row of userRows) {
          const firstLast = [row.firstName?.trim(), row.lastName?.trim()]
            .filter(Boolean)
            .join(' ')
            .trim();
          const displayName = row.displayName?.trim() || firstLast || 'Пациент';
          userDisplayNames[row.id] = displayName;
        }
      }

      const warmupSamples = pushRows
        .filter((r) => r.pushKind === 'warmup' && r.warmupSloganKey != null)
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
        [params.startIso, params.endExclusiveIso, eventType, errorClass, authMethod, params.limit, offset],
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
