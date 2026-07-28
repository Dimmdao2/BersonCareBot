import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { env } from '@/config/env';
import {
  OPERATOR_HEARTBEAT_JOB_FAMILY,
  findOperatorHeartbeat,
  type OperatorHeartbeatName,
} from '@/modules/operator-health/heartbeat';

/**
 * Излучающая сторона dead man's switch (design D-d).
 *
 * Пульс пишется в ДВА места:
 *  1. `operator_job_status` (job_family = `heartbeat`) — локальная запись, по которой
 *     пятиминутный critical-tick ловит ОТСУТСТВИЕ пульса на этой же коробке;
 *  2. внешний приёмник по URL из окружения — если он настроен.
 *
 * Внешний обязателен в проде и намеренно НЕ включён по умолчанию: пока URL пуст, наружу
 * не уходит ни одного запроса. Локальная запись — не замена внешнему приёмнику: коробка,
 * которая легла, не отправит ни локального, ни внешнего пульса, но заметить это способен
 * только тот, кто снаружи.
 */

const EXTERNAL_PING_TIMEOUT_MS = 5_000;

function externalPingUrl(name: OperatorHeartbeatName): string {
  switch (name) {
    case 'pipeline_delivery':
      return env.OPERATOR_HEARTBEAT_PIPELINE_URL;
    case 'digest':
      return env.OPERATOR_HEARTBEAT_DIGEST_URL;
    default:
      return '';
  }
}

async function pingExternalReceiver(
  name: OperatorHeartbeatName,
): Promise<'skipped' | 'ok' | 'failed'> {
  const url = externalPingUrl(name);
  if (!url) return 'skipped';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EXTERNAL_PING_TIMEOUT_MS);
  try {
    // Тело намеренно пустое: пульс не несёт ничего о пациентах (design D-h).
    const res = await fetch(url, { method: 'POST', signal: controller.signal });
    return res.ok ? 'ok' : 'failed';
  } catch {
    return 'failed';
  } finally {
    clearTimeout(timer);
  }
}

export type PingOperatorHeartbeatResult = {
  recordedLocally: boolean;
  external: 'skipped' | 'ok' | 'failed';
};

/**
 * Отбить пульс. Никогда не бросает: отказ пульса не имеет права уронить то, что его вызвало.
 *
 * @param reason короткий машинный повод (`confirmed_delivery`, `digest_tick`) — попадает в meta.
 */
export async function pingOperatorHeartbeatBestEffort(
  name: OperatorHeartbeatName,
  reason: string,
  meta: Record<string, unknown> = {},
): Promise<PingOperatorHeartbeatResult> {
  const definition = findOperatorHeartbeat(name);
  if (!definition) {
    logger.warn({ heartbeat: name }, 'heartbeat ping for unknown heartbeat name');
    return { recordedLocally: false, external: 'skipped' };
  }

  const startedAtIso = new Date().toISOString();
  let recordedLocally = false;
  try {
    await buildAppDeps().operatorHealthWrite.recordOperatorJobTickSuccess({
      jobFamily: OPERATOR_HEARTBEAT_JOB_FAMILY,
      jobKey: definition.jobKey,
      startedAtIso,
      durationMs: 0,
      metaJson: { reason, ...meta },
    });
    recordedLocally = true;
  } catch (err) {
    logger.warn({ err, heartbeat: name }, 'heartbeat local record failed');
  }

  const external = await pingExternalReceiver(name);
  if (external === 'failed') {
    logger.warn({ heartbeat: name }, 'heartbeat external ping failed');
  }

  return { recordedLocally, external };
}
