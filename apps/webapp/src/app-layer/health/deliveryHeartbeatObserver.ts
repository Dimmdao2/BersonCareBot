import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { pingOperatorHeartbeatBestEffort } from '@/app-layer/operator-health/pingOperatorHeartbeat';
import { getConfigValue } from '@/modules/system-settings/configAdapter';
import {
  OPERATOR_HEARTBEATS,
  OPERATOR_HEARTBEAT_CONFIG_KEY,
  OPERATOR_HEARTBEAT_JOB_FAMILY,
  classifyOperatorHeartbeat,
  findOperatorHeartbeat,
  parseOperatorHeartbeatStaleOverrides,
  resolveHeartbeatStaleAfterSec,
  type OperatorHeartbeatVerdict,
} from '@/modules/operator-health/heartbeat';
import {
  EMPTY_AUDIENCE_JOB_FAMILY,
  EMPTY_AUDIENCE_JOB_KEY,
  classifyEmptyAudienceSignal,
  parseEmptyAudienceCounter,
  type EmptyAudienceSignal,
} from '@/modules/operator-alerts/emptyAudience';

/**
 * Наблюдатель dead man's switch и счётчика пустой аудитории (design D-d, D-b).
 *
 * Пульс `pipeline_delivery` бьётся ТОЛЬКО когда ватермарка подтверждённых доставок сдвинулась
 * вперёд: подтверждением считается строка `outgoing_delivery_queue`, перешедшая в `sent`.
 * Мы намеренно не бьём пульс «просто потому, что тик отработал» — тогда он доказывал бы
 * работу планировщика, а не работу доставки, и в июле светился бы зелёным.
 */

const HEARTBEAT_META_LAST_SENT_KEY = 'observedLastSentAt';

export async function readOperatorHeartbeatVerdicts(
  nowMs: number = Date.now(),
): Promise<OperatorHeartbeatVerdict[]> {
  const read = buildAppDeps().operatorHealthRead;
  const overridesRaw = await getConfigValue(OPERATOR_HEARTBEAT_CONFIG_KEY);
  const overrides = parseOperatorHeartbeatStaleOverrides(overridesRaw);
  const rows = await Promise.all(
    OPERATOR_HEARTBEATS.map((definition) =>
      read
        .getOperatorJobStatus(OPERATOR_HEARTBEAT_JOB_FAMILY, definition.jobKey)
        .catch(() => null)
        .then((row) => ({ definition, row })),
    ),
  );
  return rows.map(({ definition, row }) =>
    classifyOperatorHeartbeat(
      {
        name: definition.name,
        lastPingAt: row?.lastSuccessAt ?? null,
        staleAfterSec: resolveHeartbeatStaleAfterSec(definition, overrides),
      },
      nowMs,
    ),
  );
}

export async function readEmptyAudienceSignal(
  nowMs: number = Date.now(),
): Promise<EmptyAudienceSignal> {
  const read = buildAppDeps().operatorHealthRead;
  const row = await read
    .getOperatorJobStatus(EMPTY_AUDIENCE_JOB_FAMILY, EMPTY_AUDIENCE_JOB_KEY)
    .catch(() => null);
  return classifyEmptyAudienceSignal(parseEmptyAudienceCounter(row?.metaJson), nowMs);
}

/**
 * Сдвинулась ли ватермарка подтверждённых доставок с прошлого наблюдения.
 * `null` в текущем значении означает «подтверждённых доставок не было никогда» — не пульс.
 */
export function hasConfirmedDeliveryAdvanced(
  previousObservedIso: unknown,
  currentLastSentAt: string | null,
): boolean {
  if (!currentLastSentAt) return false;
  const current = Date.parse(currentLastSentAt);
  if (!Number.isFinite(current)) return false;
  if (typeof previousObservedIso !== 'string' || !previousObservedIso.trim()) return true;
  const previous = Date.parse(previousObservedIso);
  if (!Number.isFinite(previous)) return true;
  return current > previous;
}

/**
 * Отбить пульс доставки, если и только если появилась новая ПОДТВЕРЖДЁННАЯ отправка.
 * Никогда не бросает.
 */
export async function pingPipelineHeartbeatOnConfirmedDelivery(
  currentLastSentAt: string | null,
): Promise<'pinged' | 'no_new_delivery' | 'error'> {
  const definition = findOperatorHeartbeat('pipeline_delivery');
  if (!definition) return 'error';
  try {
    const row = await buildAppDeps().operatorHealthRead.getOperatorJobStatus(
      OPERATOR_HEARTBEAT_JOB_FAMILY,
      definition.jobKey,
    );
    const previous = (row?.metaJson ?? {})[HEARTBEAT_META_LAST_SENT_KEY];
    if (!hasConfirmedDeliveryAdvanced(previous, currentLastSentAt)) return 'no_new_delivery';
    await pingOperatorHeartbeatBestEffort('pipeline_delivery', 'confirmed_delivery', {
      [HEARTBEAT_META_LAST_SENT_KEY]: currentLastSentAt,
    });
    return 'pinged';
  } catch (err) {
    logger.warn({ err }, 'pipeline heartbeat observation failed');
    return 'error';
  }
}
