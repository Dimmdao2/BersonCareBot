import { z } from 'zod';
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  inArray,
  isNull,
  lte,
  max,
  min,
  ne,
  or,
  sql,
} from 'drizzle-orm';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { integratorPushOutbox } from '../../../db/schema/schema';
import {
  integrationWebhookLastStatus,
  operatorIncidents,
  operatorJobStatus,
} from '../../../db/schema/operatorHealth';
import { outgoingDeliveryQueue } from '../../../db/schema/outgoingDeliveryQueue';
import { beOrganizationMembers, beOrganizations } from '../../../db/schema/bookingEngine';
import {
  TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS,
  type IntegratorPushOutboxHealthSnapshot,
  type IntegrationWebhookLastStatusRow,
  type OperatorBackupJobStatusRow,
  type OperatorHealthReadPort,
  type OperatorIncidentOpenRow,
  type OperatorJobStatusTickRow,
  type OutgoingDeliveryQueueHealthSnapshot,
  type WebhookBurstRow,
} from '@/modules/operator-health/ports';

/** Dead queue rows that count toward operator degradation (excludes blocked-bot finals). */
export function countAsOperatorOutgoingDeliveryDead(failureClass: string | null): boolean {
  return failureClass !== 'recipient_blocked_bot';
}

const queueCountMapSchema = z.record(z.string(), z.number().finite().nonnegative());

const outgoingDeliveryQueueHealthRootSchema = z
  .object({
    dueBacklog: z.number().finite().nonnegative(),
    deadTotal: z.number().finite().nonnegative(),
    deadRecent: z.number().finite().nonnegative(),
    lastOperatorDeadAt: z.string().nullable(),
    blockedRecipientTotal: z.number().finite().nonnegative(),
    processingCount: z.number().finite().nonnegative(),
    confirmedSentLast24h: z.number().finite().nonnegative(),
    oldestDueCreatedAt: z.string().nullable(),
    lastSentAt: z.string().nullable(),
    lastQueueActivityAt: z.string().nullable(),
    dueByChannel: queueCountMapSchema,
    dueByKind: queueCountMapSchema,
    deadByKind: queueCountMapSchema,
  })
  .strict();

/** Возраст самой старой готовой строки считается здесь: корень отдаёт момент, а не длительность. */
export function parseOutgoingDeliveryQueueHealthSnapshot(
  raw: unknown,
  nowMs: number = Date.now(),
): OutgoingDeliveryQueueHealthSnapshot {
  const parsed = outgoingDeliveryQueueHealthRootSchema.parse(raw);
  let oldestDueAgeSeconds: number | null = null;
  if (parsed.oldestDueCreatedAt) {
    const createdAtMs = Date.parse(parsed.oldestDueCreatedAt);
    if (!Number.isNaN(createdAtMs)) {
      oldestDueAgeSeconds = Math.max(0, Math.floor((nowMs - createdAtMs) / 1000));
    }
  }
  return {
    dueBacklog: parsed.dueBacklog,
    deadTotal: parsed.deadTotal,
    deadRecent: parsed.deadRecent,
    lastOperatorDeadAt: parsed.lastOperatorDeadAt,
    blockedRecipientTotal: parsed.blockedRecipientTotal,
    oldestDueAgeSeconds,
    dueByChannel: parsed.dueByChannel,
    dueByKind: parsed.dueByKind,
    deadByKind: parsed.deadByKind,
    processingCount: parsed.processingCount,
    lastSentAt: parsed.lastSentAt,
    confirmedSentLast24h: parsed.confirmedSentLast24h,
    lastQueueActivityAt: parsed.lastQueueActivityAt,
  };
}

export const pgOperatorHealthReadPort: OperatorHealthReadPort = {
  async listOpenIncidents(limit: number): Promise<OperatorIncidentOpenRow[]> {
    const db = getDrizzle();
    const rows = await db
      .select({
        id: operatorIncidents.id,
        dedupKey: operatorIncidents.dedupKey,
        direction: operatorIncidents.direction,
        integration: operatorIncidents.integration,
        errorClass: operatorIncidents.errorClass,
        errorDetail: operatorIncidents.errorDetail,
        openedAt: operatorIncidents.openedAt,
        lastSeenAt: operatorIncidents.lastSeenAt,
        occurrenceCount: operatorIncidents.occurrenceCount,
        alertSentAt: operatorIncidents.alertSentAt,
        acknowledgedAt: operatorIncidents.acknowledgedAt,
        initialAlertSentAt: operatorIncidents.initialAlertSentAt,
        oneHourAlertSentAt: operatorIncidents.oneHourAlertSentAt,
      })
      .from(operatorIncidents)
      .where(isNull(operatorIncidents.resolvedAt))
      .orderBy(desc(operatorIncidents.lastSeenAt))
      .limit(Math.min(Math.max(limit, 1), 100));

    return rows.map((r) => ({
      id: r.id,
      dedupKey: r.dedupKey,
      direction: r.direction,
      integration: r.integration,
      errorClass: r.errorClass,
      errorDetail: r.errorDetail ?? null,
      openedAt: r.openedAt,
      lastSeenAt: r.lastSeenAt,
      occurrenceCount: r.occurrenceCount,
      alertSentAt: r.alertSentAt ?? null,
      acknowledgedAt: r.acknowledgedAt ?? null,
      initialAlertSentAt: r.initialAlertSentAt ?? null,
      oneHourAlertSentAt: r.oneHourAlertSentAt ?? null,
    }));
  },

  async listBackupJobStatus(): Promise<OperatorBackupJobStatusRow[]> {
    const db = getDrizzle();
    const rows = await db
      .select({
        jobKey: operatorJobStatus.jobKey,
        jobFamily: operatorJobStatus.jobFamily,
        lastStatus: operatorJobStatus.lastStatus,
        lastStartedAt: operatorJobStatus.lastStartedAt,
        lastFinishedAt: operatorJobStatus.lastFinishedAt,
        lastSuccessAt: operatorJobStatus.lastSuccessAt,
        lastFailureAt: operatorJobStatus.lastFailureAt,
        lastDurationMs: operatorJobStatus.lastDurationMs,
        lastError: operatorJobStatus.lastError,
      })
      .from(operatorJobStatus)
      .where(eq(operatorJobStatus.jobFamily, 'backup'))
      .orderBy(operatorJobStatus.jobKey);

    return rows.map((r) => ({
      jobKey: r.jobKey,
      jobFamily: r.jobFamily,
      lastStatus: r.lastStatus,
      lastStartedAt: r.lastStartedAt ?? null,
      lastFinishedAt: r.lastFinishedAt ?? null,
      lastSuccessAt: r.lastSuccessAt ?? null,
      lastFailureAt: r.lastFailureAt ?? null,
      lastDurationMs: r.lastDurationMs ?? null,
      lastError: r.lastError ?? null,
    }));
  },

  async listIntegrationWebhookLastStatus(): Promise<IntegrationWebhookLastStatusRow[]> {
    const db = getDrizzle();
    const rows = await db
      .select({
        source: integrationWebhookLastStatus.source,
        receivedAt: integrationWebhookLastStatus.receivedAt,
        processedOk: integrationWebhookLastStatus.processedOk,
        errorClass: integrationWebhookLastStatus.errorClass,
        httpStatusReturned: integrationWebhookLastStatus.httpStatusReturned,
        detail: integrationWebhookLastStatus.detail,
      })
      .from(integrationWebhookLastStatus)
      .orderBy(integrationWebhookLastStatus.source);
    return rows.map((r) => ({
      source: r.source,
      receivedAt: r.receivedAt,
      processedOk: r.processedOk,
      errorClass: r.errorClass ?? null,
      httpStatusReturned: r.httpStatusReturned ?? null,
      detail: r.detail ?? null,
    }));
  },

  async listWebhookBurstSignals(
    windowMinutes: number,
    minCount: number,
  ): Promise<WebhookBurstRow[]> {
    const window = Math.max(1, Math.trunc(windowMinutes));
    const threshold = Math.max(1, Math.trunc(minCount));
    const result = await runWebappNamedRoot<{
      source: string;
      error_class: string;
      event_count: number | string;
    }>(
      getWebappSqlDb(),
      'app.list_integration_webhook_burst_signals(integer,integer)',
      [window, threshold],
      sql`SELECT source, error_class, event_count
          FROM app.list_integration_webhook_burst_signals(${window}, ${threshold})`,
    );
    return result.rows.map((r) => ({
      source: r.source,
      errorClass: r.error_class,
      count: Number(r.event_count ?? 0),
    }));
  },

  async getOperatorJobStatus(
    jobFamily: string,
    jobKey: string,
  ): Promise<OperatorJobStatusTickRow | null> {
    const db = getDrizzle();
    const rows = await db
      .select({
        jobKey: operatorJobStatus.jobKey,
        jobFamily: operatorJobStatus.jobFamily,
        lastStatus: operatorJobStatus.lastStatus,
        lastStartedAt: operatorJobStatus.lastStartedAt,
        lastFinishedAt: operatorJobStatus.lastFinishedAt,
        lastSuccessAt: operatorJobStatus.lastSuccessAt,
        lastFailureAt: operatorJobStatus.lastFailureAt,
        lastDurationMs: operatorJobStatus.lastDurationMs,
        lastError: operatorJobStatus.lastError,
        metaJson: operatorJobStatus.metaJson,
      })
      .from(operatorJobStatus)
      .where(and(eq(operatorJobStatus.jobFamily, jobFamily), eq(operatorJobStatus.jobKey, jobKey)))
      .limit(1);
    const r = rows[0];
    if (!r) return null;
    const meta = r.metaJson;
    const metaJson =
      meta !== null && typeof meta === 'object' && !Array.isArray(meta)
        ? (meta as Record<string, unknown>)
        : {};
    return {
      jobKey: r.jobKey,
      jobFamily: r.jobFamily,
      lastStatus: r.lastStatus,
      lastStartedAt: r.lastStartedAt ?? null,
      lastFinishedAt: r.lastFinishedAt ?? null,
      lastSuccessAt: r.lastSuccessAt ?? null,
      lastFailureAt: r.lastFailureAt ?? null,
      lastDurationMs: r.lastDurationMs ?? null,
      lastError: r.lastError ?? null,
      metaJson,
    };
  },

  /**
   * Снимок здоровья очереди доставки — объявленным корнем, а не двенадцатью запросами отношением.
   *
   * До миграции 0039 это были ровно двенадцать `db.select()` по `public.outgoing_delivery_queue`
   * под `app_staff`/`app_worker`, у которых на этой таблице нет НИ ОДНОЙ привилегии и по решению не
   * должно быть. Вызов стоит в голом `Promise.all` внутри `collectCriticalHealthSignalsBase`,
   * поэтому 42501 ронял не панель, а весь пятиминутный критический тик и баннер здоровья у врача:
   * оператор не получал ни одного критического алерта.
   */
  async getOutgoingDeliveryQueueHealth(): Promise<OutgoingDeliveryQueueHealthSnapshot> {
    const result = await runWebappNamedRoot<{ snapshot: unknown }>(
      getWebappSqlDb(),
      'app.read_operator_delivery_queue_health()',
      [],
      sql`SELECT app.read_operator_delivery_queue_health() AS snapshot`,
    );
    return parseOutgoingDeliveryQueueHealthSnapshot(result.rows[0]?.snapshot);
  },

  async getTenantIsolationCanarySnapshot() {
    const db = getDrizzle();
    const rows = await db
      .select({
        organizationId: beOrganizations.id,
        isActive: beOrganizations.isActive,
        memberRowCount: count(beOrganizationMembers.id),
      })
      .from(beOrganizations)
      .leftJoin(beOrganizationMembers, eq(beOrganizationMembers.organizationId, beOrganizations.id))
      .groupBy(beOrganizations.id, beOrganizations.isActive)
      .orderBy(beOrganizations.id)
      .limit(TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS + 1);

    return {
      organizations: rows.slice(0, TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS).map((row) => ({
        organizationId: row.organizationId,
        isActive: row.isActive,
        memberRowCount: Number(row.memberRowCount ?? 0),
      })),
      truncated: rows.length > TENANT_ISOLATION_CANARY_MAX_ORGANIZATIONS,
    };
  },
};
