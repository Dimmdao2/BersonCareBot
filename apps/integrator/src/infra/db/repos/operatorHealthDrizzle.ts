/**
 * Запись и обновление operator health таблиц через Drizzle (без сырого SQL в приложении).
 */
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import { createDbPort } from '../client.js';
import { getIntegratorDrizzle } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';

const ERROR_DETAIL_MAX = 900;

export type OpenOperatorIncidentInput = {
  dedupKey: string;
  direction: string;
  integration: string;
  errorClass: string;
  errorDetail?: string | null;
};

export type OpenOrTouchIncidentResult = {
  id: string;
  occurrenceCount: number;
};

function truncateDetail(detail: string | null | undefined): string | null {
  if (detail === undefined || detail === null || detail === '') return null;
  const t = detail.length > ERROR_DETAIL_MAX ? `${detail.slice(0, ERROR_DETAIL_MAX)}…` : detail;
  return t;
}

/**
 * Открыть инцидент или увеличить счётчик при совпадении открытого dedup_key (partial unique index).
 *
 * Goes through the narrow `app.open_or_touch_operator_incident` SECURITY DEFINER capability
 * instead of direct table INSERT/UPDATE: the integrator API login and the delivery worker
 * receive EXECUTE on this function only, never ambient DML on `public.operator_incidents`.
 */
export async function openOrTouchOperatorIncident(
  input: OpenOperatorIncidentInput,
): Promise<OpenOrTouchIncidentResult> {
  const errorDetail = truncateDetail(input.errorDetail);
  const result = await runIntegratorSql<{ id: string; occurrence_count: number }>(
    createDbPort(),
    sql`SELECT id, occurrence_count
        FROM app.open_or_touch_operator_incident(
          ${input.dedupKey}, ${input.direction}, ${input.integration}, ${input.errorClass}, ${errorDetail}
        )`,
  );
  const row = result.rows[0];
  if (!row) {
    throw new Error('openOrTouchOperatorIncident: empty returning');
  }
  return { id: row.id, occurrenceCount: row.occurrence_count };
}

export async function markOperatorIncidentAlertSent(incidentId: string): Promise<void> {
  const db = getIntegratorDrizzle();
  await db
    .update(operatorIncidents)
    .set({ alertSentAt: new Date().toISOString() })
    .where(eq(operatorIncidents.id, incidentId));
}

export async function getOperatorIncidentAlertState(
  incidentId: string,
): Promise<{ alertSentAt: string | null } | null> {
  const db = getIntegratorDrizzle();
  const rows = await db
    .select({ alertSentAt: operatorIncidents.alertSentAt })
    .from(operatorIncidents)
    .where(eq(operatorIncidents.id, incidentId))
    .limit(1);
  const r = rows[0];
  if (!r) return null;
  return { alertSentAt: r.alertSentAt ?? null };
}

/**
 * Закрыть все открытые инциденты, чей dedup_key начинается с префикса.
 */
const OPERATOR_HEALTH_JOB_FAMILY = 'health';
const OPERATOR_OUTBOUND_PROBE_JOB_KEY = 'health.outbound_probe.run';
const OPERATOR_OUTBOUND_PROBE_CHANNELS = ['max', 'telegram', 'google_calendar'] as const;
type OperatorOutboundProbeChannel = (typeof OPERATOR_OUTBOUND_PROBE_CHANNELS)[number];

/**
 * Записать результат синтетических проб в `operator_job_status` для 3-strike critical tick.
 */
export async function recordOperatorOutboundProbeRun(input: {
  max: string;
  telegram: string;
  google_calendar: string;
  probed?: readonly OperatorOutboundProbeChannel[];
}): Promise<{
  consecutiveFailRuns: number;
  consecutiveFailures: Record<string, number>;
  lastRunAt: Record<string, string>;
}> {
  const db = getIntegratorDrizzle();
  const existing = await db
    .select({ metaJson: operatorJobStatus.metaJson })
    .from(operatorJobStatus)
    .where(eq(operatorJobStatus.jobKey, OPERATOR_OUTBOUND_PROBE_JOB_KEY))
    .limit(1);

  const prevMeta =
    existing[0]?.metaJson &&
    typeof existing[0].metaJson === 'object' &&
    !Array.isArray(existing[0].metaJson)
      ? (existing[0].metaJson as Record<string, unknown>)
      : {};
  const probed: readonly OperatorOutboundProbeChannel[] =
    input.probed ?? OPERATOR_OUTBOUND_PROBE_CHANNELS;
  const finishedIso = new Date().toISOString();
  const previousFailures =
    prevMeta.consecutiveFailures && typeof prevMeta.consecutiveFailures === 'object'
      ? (prevMeta.consecutiveFailures as Record<string, unknown>)
      : {};
  const previousLastRunAt =
    prevMeta.lastRunAt && typeof prevMeta.lastRunAt === 'object'
      ? (prevMeta.lastRunAt as Record<string, unknown>)
      : {};
  const consecutiveFailures: Record<string, number> = {};
  const lastRunAt: Record<string, string> = {};
  for (const channel of OPERATOR_OUTBOUND_PROBE_CHANNELS) {
    const outcome = input[channel];
    const previous =
      typeof previousFailures[channel] === 'number' && Number.isFinite(previousFailures[channel])
        ? Math.max(0, Math.trunc(previousFailures[channel] as number))
        : 0;
    consecutiveFailures[channel] = probed.includes(channel)
      ? outcome === 'fail'
        ? previous + 1
        : outcome === 'ok'
          ? 0
          : previous
      : previous;
    const previousAt = previousLastRunAt[channel];
    lastRunAt[channel] = probed.includes(channel)
      ? finishedIso
      : typeof previousAt === 'string'
        ? previousAt
        : '';
  }
  const anyFail = probed.some((channel) => input[channel] === 'fail');
  const consecutiveFailRuns = Math.max(...Object.values(consecutiveFailures));
  const metaJson = {
    max: input.max,
    telegram: input.telegram,
    google_calendar: input.google_calendar,
    consecutiveFailRuns,
    consecutiveFailures,
    lastRunAt,
  };

  const conflictSet = anyFail
    ? {
        jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
        lastStatus: 'failure' as const,
        lastFinishedAt: finishedIso,
        lastFailureAt: finishedIso,
        lastDurationMs: 0,
        lastError: 'probe_fail',
        metaJson,
      }
    : {
        jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
        lastStatus: 'success' as const,
        lastFinishedAt: finishedIso,
        lastSuccessAt: finishedIso,
        lastFailureAt: null,
        lastDurationMs: 0,
        lastError: null,
        metaJson,
      };

  await db
    .insert(operatorJobStatus)
    .values({
      jobKey: OPERATOR_OUTBOUND_PROBE_JOB_KEY,
      jobFamily: OPERATOR_HEALTH_JOB_FAMILY,
      lastStatus: anyFail ? 'failure' : 'success',
      lastStartedAt: finishedIso,
      lastFinishedAt: finishedIso,
      lastSuccessAt: anyFail ? null : finishedIso,
      lastFailureAt: anyFail ? finishedIso : null,
      lastDurationMs: 0,
      lastError: anyFail ? 'probe_fail' : null,
      metaJson,
    })
    .onConflictDoUpdate({
      target: operatorJobStatus.jobKey,
      set: conflictSet,
    });

  return { consecutiveFailRuns, consecutiveFailures, lastRunAt };
}

export async function getOperatorOutboundProbeLastRunAt(): Promise<Record<string, string | null>> {
  const db = getIntegratorDrizzle();
  const rows = await db
    .select({ metaJson: operatorJobStatus.metaJson })
    .from(operatorJobStatus)
    .where(eq(operatorJobStatus.jobKey, OPERATOR_OUTBOUND_PROBE_JOB_KEY))
    .limit(1);
  const meta =
    rows[0]?.metaJson && typeof rows[0].metaJson === 'object' && !Array.isArray(rows[0].metaJson)
      ? (rows[0].metaJson as Record<string, unknown>)
      : {};
  const lastRunAt =
    meta.lastRunAt && typeof meta.lastRunAt === 'object'
      ? (meta.lastRunAt as Record<string, unknown>)
      : {};
  return Object.fromEntries(
    OPERATOR_OUTBOUND_PROBE_CHANNELS.map((channel) => [
      channel,
      typeof lastRunAt[channel] === 'string' && lastRunAt[channel] ? lastRunAt[channel] : null,
    ]),
  );
}

export async function resolveOpenOperatorIncidentsByDedupKeyPrefix(
  prefix: string,
): Promise<number> {
  const db = getIntegratorDrizzle();
  const pattern = `${prefix}%`;
  const finishedAt = new Date().toISOString();
  const rows = await db
    .update(operatorIncidents)
    .set({ resolvedAt: finishedAt })
    .where(and(isNull(operatorIncidents.resolvedAt), like(operatorIncidents.dedupKey, pattern)))
    .returning({ id: operatorIncidents.id });
  return rows.length;
}
