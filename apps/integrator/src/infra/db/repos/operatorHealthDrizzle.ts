/**
 * Запись и обновление operator health таблиц через Drizzle (без сырого SQL в приложении).
 */
import { and, eq, isNull, like, sql } from 'drizzle-orm';
import { operatorIncidents, operatorJobStatus } from '@bersoncare/operator-db-schema';
import { createDbPort } from '../client.js';
import { getIntegratorDrizzle } from '../drizzle.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../withClient.js';

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
  // app.open_or_touch_operator_incident stays delivery-worker-only (C4 asserts the scheduler does
  // NOT hold it), so the probe contour goes through its own narrower door, which pins
  // direction/integration/error_class to the three outbound probes it owns.
  const viaProbeCapability = getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler';
  const result = await runIntegratorSql<{ id: string; occurrence_count: number }>(
    createDbPort(),
    viaProbeCapability
      ? sql`SELECT id, occurrence_count
            FROM app.open_or_touch_operator_probe_incident(
              ${input.integration}, ${input.errorClass}, ${errorDetail}
            )`
      : sql`SELECT id, occurrence_count
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
 * `public.operator_job_status` carries every operator contour's row, so no capability role gets
 * table access to it: the scheduler reads and writes ITS row through two capabilities that pin
 * `job_key` inside the function body. Before this the probe tick did a plain table SELECT and
 * threw `42501 permission denied for table operator_job_status` on every 5-second poll, which is
 * why the MAX / Telegram / Google Calendar probes had never run under the locked operational role.
 */
async function readOperatorOutboundProbeMeta(): Promise<Record<string, unknown>> {
  if (getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler') {
    const result = await runIntegratorSql<{ meta_json: unknown }>(
      createDbPort(),
      sql`SELECT app.read_operator_outbound_probe_meta() AS meta_json`,
    );
    const meta = result.rows[0]?.meta_json;
    return meta && typeof meta === 'object' && !Array.isArray(meta)
      ? (meta as Record<string, unknown>)
      : {};
  }
  const rows = await getIntegratorDrizzle()
    .select({ metaJson: operatorJobStatus.metaJson })
    .from(operatorJobStatus)
    .where(eq(operatorJobStatus.jobKey, OPERATOR_OUTBOUND_PROBE_JOB_KEY))
    .limit(1);
  const meta = rows[0]?.metaJson;
  return meta && typeof meta === 'object' && !Array.isArray(meta)
    ? (meta as Record<string, unknown>)
    : {};
}

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
  const prevMeta = await readOperatorOutboundProbeMeta();
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

  if (getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler') {
    await runIntegratorSql(
      createDbPort(),
      sql`SELECT app.record_operator_outbound_probe_run(
        ${anyFail ? 'failure' : 'success'},
        ${finishedIso}::timestamptz,
        ${anyFail ? 'probe_fail' : null},
        ${metaJson}::jsonb
      )`,
    );
  } else {
    await getIntegratorDrizzle()
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
  }

  return { consecutiveFailRuns, consecutiveFailures, lastRunAt };
}

export async function getOperatorOutboundProbeLastRunAt(): Promise<Record<string, string | null>> {
  const meta = await readOperatorOutboundProbeMeta();
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
  // The scheduler has no DML on public.operator_incidents; its capability writes resolved_at only
  // and rejects any prefix outside the three outbound probes.
  if (getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler') {
    const result = await runIntegratorSql<{ resolved: number }>(
      createDbPort(),
      sql`SELECT app.resolve_operator_probe_incidents(${prefix}) AS resolved`,
    );
    return Number(result.rows[0]?.resolved ?? 0);
  }
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
