/**
 * Запись и обновление operator health таблиц через Drizzle (без сырого SQL в приложении).
 */
import { sql } from 'drizzle-orm';
import { OUTBOUND_PROVIDER_INCIDENT_DIRECTION } from '@bersoncare/operator-db-schema';
import { createDbPort } from '../client.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { getCurrentIntegratorTechnicalRuntimeRole } from '../withClient.js';
import { runWithDeliveryWorkerPrincipal } from '../../principal/organizationPrincipal.js';

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
 *
 * The runtime role is selected HERE, by the capability wrapper, and not by whoever happens to be
 * reporting the failure. EXECUTE on this root is held by `app_operational_delivery_worker` alone,
 * while an operator incident is opened from every contour there is: a booking-lifecycle step under
 * an organization principal (`app_tenant_service`), a relay/SMS/email provider failure on a bare
 * HTTP handler that carries no principal at all, a write-port fallback, the delivery tick. Before
 * this scope, every one of those paths lost its incident to a swallowed 42501 — the failure was
 * named in the journal and reached no operator. Same shape and same reason as
 * `readAvailabilityValueJson` (`../platformIntegrationAvailability.ts`) and
 * `runWithDeliveryWorkerPrincipal`'s own note about
 * `app.revalidate_patient_reminder_delivery_materialization`.
 */
export async function openOrTouchOperatorIncident(
  input: OpenOperatorIncidentInput,
): Promise<OpenOrTouchIncidentResult> {
  const errorDetail = truncateDetail(input.errorDetail);
  // app.open_or_touch_operator_incident stays delivery-worker-only (C4 asserts the scheduler does
  // NOT hold it), so the probe contour goes through its own narrower door, which pins
  // direction/integration/error_class to the three outbound probes it owns.
  const viaProbeCapability =
    getCurrentIntegratorTechnicalRuntimeRole() === 'app_operational_scheduler';
  const runProbeRoot = () =>
    runIntegratorSql<{ id: string; occurrence_count: number }>(
      createDbPort(),
      sql`SELECT id, occurrence_count
          FROM app.open_or_touch_operator_probe_incident(
            ${input.integration}, ${input.errorClass}, ${errorDetail}
          )`,
    );
  const runIncidentRoot = () =>
    runIntegratorSql<{ id: string; occurrence_count: number }>(
      createDbPort(),
      sql`SELECT id, occurrence_count
          FROM app.open_or_touch_operator_incident(
            ${input.dedupKey}, ${input.direction}, ${input.integration}, ${input.errorClass}, ${errorDetail}
          )`,
    );
  const result = viaProbeCapability
    ? await runProbeRoot()
    : await runWithDeliveryWorkerPrincipal(runIncidentRoot);
  const row = result.rows[0];
  if (!row) {
    throw new Error('openOrTouchOperatorIncident: empty returning');
  }
  return { id: row.id, occurrenceCount: row.occurrence_count };
}

/**
 * D17 шаг 2b. Здесь стояли `markOperatorIncidentAlertSent` и `getOperatorIncidentAlertState` —
 * реляционные UPDATE/SELECT по `public.operator_incidents` через Drizzle. Обе были мёртвым кодом:
 * ни одного вызова в продуктовом дереве, а живая отметка «оповещение отправлено» идёт через
 * одноимённую дверь в `outgoingDeliveryScope.ts` (`app.mark_operator_incident_alert_sent`,
 * `outgoingDeliveryWorker.ts:745`) с другой сигнатурой. Второй путь к той же записи — нарушение §5.
 */

const OPERATOR_OUTBOUND_PROBE_CHANNELS = ['max', 'telegram', 'google_calendar'] as const;
type OperatorOutboundProbeChannel = (typeof OPERATOR_OUTBOUND_PROBE_CHANNELS)[number];

/**
 * `public.operator_job_status` carries every operator contour's row, so no capability role gets
 * table access to it: the scheduler reads and writes ITS row through two capabilities that pin
 * `job_key` inside the function body. Before this the probe tick did a plain table SELECT and
 * threw `42501 permission denied for table operator_job_status` on every 5-second poll, which is
 * why the MAX / Telegram / Google Calendar probes had never run under the locked operational role.
 *
 * D17 шаг 2b: запасной реляционный путь по этой таблице (SELECT здесь и upsert в
 * `recordOperatorOutboundProbeRun`) убран. Он был вторым путём к той же записи и недостижимым:
 * единственный живой вызывающий — тик расписания под `scheduler:handle-tick-event`, то есть роль
 * всегда `app_operational_scheduler`, и `job_key` пинится телом двери, а не вызывающим.
 */
async function readOperatorOutboundProbeMeta(): Promise<Record<string, unknown>> {
  const result = await runIntegratorSql<{ meta_json: unknown }>(
    createDbPort(),
    sql`SELECT app.read_operator_outbound_probe_meta() AS meta_json`,
  );
  const meta = result.rows[0]?.meta_json;
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

  await runIntegratorSql(
    createDbPort(),
    sql`SELECT app.record_operator_outbound_probe_run(
      ${anyFail ? 'failure' : 'success'},
      ${finishedIso}::timestamptz,
      ${anyFail ? 'probe_fail' : null},
      ${metaJson}::jsonb
    )`,
  );

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

/**
 * Проба выздоровела — закрыть то, что открыла она сама.
 *
 * Ключей два, потому что у пробы два класса отказа. Обычный промах (таймаут, сеть) живёт под
 * `outbound:<интеграция>:` и ждёт порога подряд идущих промахов. Отказ по учётным данным, квоте
 * или ненастроенности пейджится с первого раза и потому лежит там же, где такой же отказ
 * настоящей отправки, — под `outbound_delivery_provider:<интеграция>:`.
 *
 * Во втором пространстве закрываются ТОЛЬКО классы «пейджить с первого раза». Успешный `getMe`
 * доказывает, что учётные данные и квота в порядке, — и ничего не говорит про `provider_send_failed`
 * конкретного сообщения. Закрыть там чужую строку значило бы потушить живой отказ отправки
 * успехом соседней проверки.
 */
export async function resolveOpenOperatorOutboundProbeIncidents(
  integration: 'max' | 'telegram' | 'google_calendar',
): Promise<number> {
  const probeResolved = await resolveOpenOperatorIncidentsByDedupKeyPrefix(
    `outbound:${integration}:`,
  );
  const providerResolved = await resolveOpenOperatorIncidentsByDedupKeyPrefix(
    `${OUTBOUND_PROVIDER_INCIDENT_DIRECTION}:${integration}:`,
  );
  return probeResolved + providerResolved;
}

/**
 * D17 шаг 2b: остался ОДИН путь — узкая дверь пробы. Реляционный `UPDATE` по
 * `public.operator_incidents`, стоявший здесь запасным вариантом, был вторым путём к той же записи
 * и при этом недостижимым: единственный живой вызывающий — тик расписания
 * (`runScheduledOperatorHealthProbeTick` → `runWithInfraPrincipal('scheduler:handle-tick-event')`),
 * то есть роль всегда `app_operational_scheduler`. У самой роли DML на этой таблице нет; дверь
 * пишет только `resolved_at` и сама отбирает классы «пейджить с первого раза» в пространстве
 * `outbound_delivery_provider` — поэтому список классов в аргументах больше не нужен.
 */
export async function resolveOpenOperatorIncidentsByDedupKeyPrefix(
  prefix: string,
): Promise<number> {
  const result = await runIntegratorSql<{ resolved: number }>(
    createDbPort(),
    sql`SELECT app.resolve_operator_probe_incidents(${prefix}) AS resolved`,
  );
  return Number(result.rows[0]?.resolved ?? 0);
}
