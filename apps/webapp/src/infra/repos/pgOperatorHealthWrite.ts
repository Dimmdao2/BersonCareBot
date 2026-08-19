import { and, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { OutboundProviderAlertClaim } from '@/modules/operator-health/ports';
import { getDrizzle } from '@/app-layer/db/drizzle';
import { getWebappSqlDb, runWebappNamedRoot } from '@/infra/db/runWebappSql';
import { operatorIncidents, operatorJobStatus } from '../../../db/schema/operatorHealth';
import {
  OPERATOR_MEDIA_JOB_FAMILY,
  OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
} from '@/modules/operator-health/reconcileJobKeys';
import { type OperatorHealthWritePort } from '@/modules/operator-health/ports';

const MAX_JOB_ERROR_CHARS = 2_048;

/**
 * Разбор ответа `app.open_or_touch_operator_critical_incident(...)`. Строка без `id` — это не
 * открытый инцидент: каденция считает по нему T0 -> +1ч, и достроить его умолчанием значило бы
 * рапортовать о записи, которой нет.
 */
function parseOpenedCriticalIncident(payload: unknown): { id: string; openedAt: string } {
  const row = payload && typeof payload === 'object' ? (payload as Record<string, unknown>) : null;
  const id = typeof row?.id === 'string' ? row.id : null;
  const openedAt = typeof row?.openedAt === 'string' ? row.openedAt : null;
  if (!id || !openedAt) throw new Error('operator_critical_incident_open_invalid');
  return { id, openedAt: new Date(openedAt).toISOString() };
}

function clampErrorMessage(message: string): string {
  if (message.length <= MAX_JOB_ERROR_CHARS) return message;
  return `${message.slice(0, MAX_JOB_ERROR_CHARS)}…`;
}

async function upsertOperatorJobSuccess(input: {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  metaJson: Record<string, unknown>;
}): Promise<void> {
  const db = getDrizzle();
  const finishedIso = new Date().toISOString();
  await db.transaction(async (tx) => {
    await tx
      .insert(operatorJobStatus)
      .values({
        jobKey: input.jobKey,
        jobFamily: input.jobFamily,
        lastStatus: 'success',
        lastStartedAt: input.startedAtIso,
        lastFinishedAt: finishedIso,
        lastSuccessAt: finishedIso,
        lastFailureAt: null,
        lastDurationMs: input.durationMs,
        lastError: null,
        metaJson: input.metaJson,
      })
      .onConflictDoUpdate({
        target: operatorJobStatus.jobKey,
        set: {
          jobFamily: input.jobFamily,
          lastStatus: 'success',
          lastStartedAt: input.startedAtIso,
          lastFinishedAt: finishedIso,
          lastSuccessAt: finishedIso,
          lastFailureAt: null,
          lastDurationMs: input.durationMs,
          lastError: null,
          metaJson: input.metaJson,
        },
      });
  });
}

async function upsertOperatorJobFailure(input: {
  jobFamily: string;
  jobKey: string;
  startedAtIso: string;
  durationMs: number;
  error: string;
  metaJson: Record<string, unknown>;
  clearMetaOnFailure: boolean;
}): Promise<void> {
  const db = getDrizzle();
  const finishedIso = new Date().toISOString();
  const err = clampErrorMessage(input.error);
  const metaJson = input.clearMetaOnFailure ? {} : input.metaJson;
  await db.transaction(async (tx) => {
    await tx
      .insert(operatorJobStatus)
      .values({
        jobKey: input.jobKey,
        jobFamily: input.jobFamily,
        lastStatus: 'failure',
        lastStartedAt: input.startedAtIso,
        lastFinishedAt: finishedIso,
        lastSuccessAt: null,
        lastFailureAt: finishedIso,
        lastDurationMs: input.durationMs,
        lastError: err,
        metaJson,
      })
      .onConflictDoUpdate({
        target: operatorJobStatus.jobKey,
        set: {
          jobFamily: input.jobFamily,
          lastStatus: 'failure',
          lastStartedAt: input.startedAtIso,
          lastFinishedAt: finishedIso,
          lastFailureAt: finishedIso,
          lastDurationMs: input.durationMs,
          lastError: err,
          metaJson,
        },
      });
  });
}

export const pgOperatorHealthWritePort: OperatorHealthWritePort = {
  async recordOperatorJobTickSuccess(input) {
    await upsertOperatorJobSuccess(input);
  },

  async recordOperatorJobTickFailure(input) {
    await upsertOperatorJobFailure({
      ...input,
      clearMetaOnFailure: false,
    });
  },

  async recordMediaTranscodeReconcileSuccess(input) {
    await upsertOperatorJobSuccess({
      jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      metaJson: input.metaJson,
    });
  },

  async recordMediaTranscodeReconcileFailure(input) {
    await upsertOperatorJobFailure({
      jobKey: OPERATOR_MEDIA_TRANSCODE_RECONCILE_JOB_KEY,
      jobFamily: OPERATOR_MEDIA_JOB_FAMILY,
      startedAtIso: input.startedAtIso,
      durationMs: input.durationMs,
      error: input.error,
      metaJson: {},
      clearMetaOnFailure: true,
    });
  },

  async resolveAllOpenIncidents() {
    const result = await runWebappNamedRoot<{ resolved_count: number | string }>(
      getWebappSqlDb(),
      'app.resolve_all_open_operator_incidents()',
      [],
      sql`SELECT app.resolve_all_open_operator_incidents() AS resolved_count`,
    );
    return { resolved: Number(result.rows[0]?.resolved_count ?? 0) };
  },

  async acknowledgeOpenOutboundProviderIncidents() {
    const result = await runWebappNamedRoot<{ acknowledged_count: number | string }>(
      getWebappSqlDb(),
      'app.acknowledge_open_outbound_provider_incidents()',
      [],
      sql`SELECT app.acknowledge_open_outbound_provider_incidents() AS acknowledged_count`,
    );
    return { acknowledged: Number(result.rows[0]?.acknowledged_count ?? 0) };
  },

  async claimDueOutboundProviderAlert(input) {
    const db = getDrizzle();
    type ClaimedRow = {
      id: string;
      dedup_key: string;
      direction: string;
      integration: string;
      error_class: string;
      error_detail: string | null;
      opened_at: string;
      last_seen_at: string;
      occurrence_count: number;
      alert_sent_at: string | null;
      acknowledged_at: string | null;
      initial_alert_sent_at: string | null;
      one_hour_alert_sent_at: string | null;
      phase: 'initial' | 'one_hour_repeat';
    };
    const result = await db.execute<ClaimedRow>(sql`
      WITH due AS (
        SELECT id,
          CASE
            WHEN initial_alert_sent_at IS NULL THEN 'initial'
            ELSE 'one_hour_repeat'
          END AS phase
        FROM public.operator_incidents
        WHERE resolved_at IS NULL
          AND acknowledged_at IS NULL
          AND direction = 'outbound_delivery_provider'
          AND id NOT IN (
            SELECT value::uuid
            FROM jsonb_array_elements_text(${JSON.stringify(input.excludeIncidentIds)}::jsonb) AS excluded(value)
          )
          AND (
            initial_alert_sent_at IS NULL
            OR (
              one_hour_alert_sent_at IS NULL
              AND opened_at + interval '1 hour' <= ${input.nowIso}::timestamptz
            )
          )
          AND (alert_claimed_at IS NULL OR alert_claimed_at < ${input.staleBeforeIso}::timestamptz)
        ORDER BY opened_at, id
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE public.operator_incidents AS incident
      SET alert_claim_phase = due.phase,
          alert_claim_token = ${input.claimToken}::uuid,
          alert_claimed_at = ${input.nowIso}::timestamptz
      FROM due
      WHERE incident.id = due.id
      RETURNING incident.id, incident.dedup_key, incident.direction, incident.integration,
        incident.error_class, incident.error_detail, incident.opened_at, incident.last_seen_at,
        incident.occurrence_count, incident.alert_sent_at, incident.acknowledged_at,
        incident.initial_alert_sent_at, incident.one_hour_alert_sent_at, due.phase
    `);
    const row = result.rows[0];
    if (!row) return null;
    const claim: OutboundProviderAlertClaim = {
      id: row.id,
      dedupKey: row.dedup_key,
      direction: row.direction,
      integration: row.integration,
      errorClass: row.error_class,
      errorDetail: row.error_detail,
      openedAt: row.opened_at,
      lastSeenAt: row.last_seen_at,
      occurrenceCount: Number(row.occurrence_count),
      alertSentAt: row.alert_sent_at,
      acknowledgedAt: row.acknowledged_at,
      initialAlertSentAt: row.initial_alert_sent_at,
      oneHourAlertSentAt: row.one_hour_alert_sent_at,
      phase: row.phase,
      claimToken: input.claimToken,
    };
    return claim;
  },

  async completeOutboundProviderAlertClaim(input) {
    const db = getDrizzle();
    const sentField =
      input.phase === 'initial'
        ? { initialAlertSentAt: input.sentAtIso }
        : { oneHourAlertSentAt: input.sentAtIso };
    const rows = await db
      .update(operatorIncidents)
      .set({
        ...sentField,
        alertSentAt: input.sentAtIso,
        alertClaimPhase: null,
        alertClaimToken: null,
        alertClaimedAt: null,
      })
      .where(
        and(
          eq(operatorIncidents.id, input.incidentId),
          eq(operatorIncidents.alertClaimToken, input.claimToken),
          eq(operatorIncidents.alertClaimPhase, input.phase),
          isNull(operatorIncidents.resolvedAt),
          isNull(operatorIncidents.acknowledgedAt),
        ),
      )
      .returning({ id: operatorIncidents.id });
    return rows.length === 1;
  },

  async releaseOutboundProviderAlertClaim(input) {
    const db = getDrizzle();
    const rows = await db
      .update(operatorIncidents)
      .set({ alertClaimPhase: null, alertClaimToken: null, alertClaimedAt: null })
      .where(
        and(
          eq(operatorIncidents.id, input.incidentId),
          eq(operatorIncidents.alertClaimToken, input.claimToken),
        ),
      )
      .returning({ id: operatorIncidents.id });
    return rows.length === 1;
  },

  async markOpenIncidentsAlertSent(input) {
    const incidentIds = [...new Set(input.incidentIds)].filter(Boolean);
    if (incidentIds.length === 0) return { updated: 0 };
    const db = getDrizzle();
    const rows = await db
      .update(operatorIncidents)
      .set({ alertSentAt: input.alertSentAtIso })
      .where(and(isNull(operatorIncidents.resolvedAt), inArray(operatorIncidents.id, incidentIds)))
      .returning({ id: operatorIncidents.id });
    return { updated: rows.length };
  },

  /**
   * Открытие инцидента идёт объявленным корнем, а не отношением. Прямой INSERT под `app_worker`
   * отбивался `42501 permission denied for table operator_incidents` (замер 19.08 на TEST,
   * 11:28:37, и одинаково каждые пять минут): у рабочей роли на этой таблице поколоночный INSERT
   * на семь колонок, а drizzle перечисляет в INSERT ВСЕ колонки, подставляя `default` десяти
   * остальным. Сторож читал инциденты и не мог открыть ни одного — в ту минуту, когда он
   * действительно что-то замечал, тик падал целиком, и человек не видел на
   * `/app/admin/system-health` ни строки.
   */
  async openOrTouchCriticalAlertIncident(input) {
    const errorDetail = input.errorDetail ?? null;
    const result = await runWebappNamedRoot<{ incident: unknown }>(
      getWebappSqlDb(),
      'app.open_or_touch_operator_critical_incident(text,text,text,timestamp with time zone,text)',
      [input.dedupKey, input.direction, input.integration, input.nowIso, errorDetail],
      sql`SELECT app.open_or_touch_operator_critical_incident(
        ${input.dedupKey}::text, ${input.direction}::text, ${input.integration}::text,
        ${input.nowIso}::timestamptz, ${errorDetail}::text
      ) AS incident`,
    );
    return parseOpenedCriticalIncident(result.rows[0]?.incident);
  },

  async claimIncidentAlertIfDue(input) {
    const db = getDrizzle();
    type ClaimedRow = {
      id: string;
      dedup_key: string;
      direction: string;
      integration: string;
      error_class: string;
      error_detail: string | null;
      opened_at: string;
      last_seen_at: string;
      occurrence_count: number;
      alert_sent_at: string | null;
      acknowledged_at: string | null;
      initial_alert_sent_at: string | null;
      one_hour_alert_sent_at: string | null;
      phase: 'initial' | 'one_hour_repeat';
    };
    // Same due/claim shape as `claimDueOutboundProviderAlert`, narrowed to ONE known incident id
    // instead of a direction-filtered scan — the critical tick already knows which row it just
    // opened-or-touched, so there is no cross-topic set to scan or exclude here.
    const result = await db.execute<ClaimedRow>(sql`
      WITH due AS (
        SELECT id,
          CASE
            WHEN initial_alert_sent_at IS NULL THEN 'initial'
            ELSE 'one_hour_repeat'
          END AS phase
        FROM public.operator_incidents
        WHERE id = ${input.incidentId}::uuid
          AND resolved_at IS NULL
          AND acknowledged_at IS NULL
          AND (
            initial_alert_sent_at IS NULL
            OR (
              one_hour_alert_sent_at IS NULL
              AND opened_at + interval '1 hour' <= ${input.nowIso}::timestamptz
            )
          )
          AND (alert_claimed_at IS NULL OR alert_claimed_at < ${input.staleBeforeIso}::timestamptz)
        FOR UPDATE SKIP LOCKED
        LIMIT 1
      )
      UPDATE public.operator_incidents AS incident
      SET alert_claim_phase = due.phase,
          alert_claim_token = ${input.claimToken}::uuid,
          alert_claimed_at = ${input.nowIso}::timestamptz
      FROM due
      WHERE incident.id = due.id
      RETURNING incident.id, incident.dedup_key, incident.direction, incident.integration,
        incident.error_class, incident.error_detail, incident.opened_at, incident.last_seen_at,
        incident.occurrence_count, incident.alert_sent_at, incident.acknowledged_at,
        incident.initial_alert_sent_at, incident.one_hour_alert_sent_at, due.phase
    `);
    const row = result.rows[0];
    if (!row) return null;
    const claim: OutboundProviderAlertClaim = {
      id: row.id,
      dedupKey: row.dedup_key,
      direction: row.direction,
      integration: row.integration,
      errorClass: row.error_class,
      errorDetail: row.error_detail,
      openedAt: row.opened_at,
      lastSeenAt: row.last_seen_at,
      occurrenceCount: Number(row.occurrence_count),
      alertSentAt: row.alert_sent_at,
      acknowledgedAt: row.acknowledged_at,
      initialAlertSentAt: row.initial_alert_sent_at,
      oneHourAlertSentAt: row.one_hour_alert_sent_at,
      phase: row.phase,
      claimToken: input.claimToken,
    };
    return claim;
  },

  async resolveStaleCriticalAlertIncidents(input) {
    const db = getDrizzle();
    const finishedIso = new Date().toISOString();
    // Mirrors `claimDueOutboundProviderAlert`'s exclude-list pattern (jsonb array -> NOT IN),
    // which is empty-array-safe: an empty `activeDedupKeys` correctly resolves every open
    // incident OF THIS CADENCE (a fully healthy tick with no critical candidates left) — and only
    // of this cadence, so a sweep never closes rows it cannot see the candidates for.
    const result = await db.execute<{ id: string }>(sql`
      UPDATE public.operator_incidents
      SET resolved_at = ${finishedIso}::timestamptz,
          alert_claim_phase = NULL,
          alert_claim_token = NULL,
          alert_claimed_at = NULL
      WHERE resolved_at IS NULL
        AND integration = ${input.integration}
        AND dedup_key NOT IN (
          SELECT value
          FROM jsonb_array_elements_text(${JSON.stringify(input.activeDedupKeys)}::jsonb) AS excluded(value)
        )
      RETURNING id
    `);
    return { resolved: result.rows.length };
  },

  async purgeIntegrationWebhookErrorEventsOlderThanHours(hours: number) {
    const h = Math.max(1, Math.trunc(hours));
    const result = await runWebappNamedRoot<{ deleted_count: number | string }>(
      getWebappSqlDb(),
      'app.prune_integration_webhook_error_events(integer)',
      [h],
      sql`SELECT app.prune_integration_webhook_error_events(${h}) AS deleted_count`,
    );
    return { deleted: Number(result.rows[0]?.deleted_count ?? 0) };
  },
};
