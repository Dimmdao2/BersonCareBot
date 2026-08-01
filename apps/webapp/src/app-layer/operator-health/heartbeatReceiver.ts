import { NextResponse } from 'next/server';
import { enterWithDbInfraPrincipal } from '@bersoncare/db-principal';
import { logger } from '@/app-layer/logging/logger';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  OPERATOR_HEARTBEAT_CONFIG_KEY,
  OPERATOR_HEARTBEAT_JOB_FAMILY,
  classifyOperatorHeartbeat,
  findOperatorHeartbeat,
  parseOperatorHeartbeatStaleOverrides,
  resolveHeartbeatStaleAfterSec,
  type OperatorHeartbeatName,
} from '@/modules/operator-health/heartbeat';
import { getConfigValue } from '@/modules/system-settings/configAdapter';

/**
 * Тело локального приёмника dead man's switch (design D-d).
 *
 * Маршруты держатся СТАТИЧЕСКИМИ, по одному файлу на пульс, а не одним динамическим
 * `[name]`: перепись мутирующих маршрутов и аудит CSRF-исключений сопоставляют
 * путь-исключение с файлом маршрута буквально. Динамический сегмент выпал бы из этого
 * аудита — то есть механизм безопасности молча перестал бы покрывать новый маршрут.
 * Проверка bearer намеренно лежит в самих файлах маршрутов: этого требует аудит
 * «каждое internal-исключение связано с constant-time сверкой INTERNAL_JOB_SECRET».
 */

export async function recordHeartbeatPing(name: OperatorHeartbeatName): Promise<NextResponse> {
  const definition = findOperatorHeartbeat(name);
  if (!definition) {
    return NextResponse.json({ ok: false, error: 'unknown_heartbeat' }, { status: 404 });
  }
  enterWithDbInfraPrincipal({ source: `api/internal/heartbeat/${name}:POST` });
  const receivedAt = new Date().toISOString();
  try {
    await buildAppDeps().operatorHealthWrite.recordOperatorJobTickSuccess({
      jobFamily: OPERATOR_HEARTBEAT_JOB_FAMILY,
      jobKey: definition.jobKey,
      startedAtIso: receivedAt,
      durationMs: 0,
      metaJson: { reason: 'receiver' },
    });
  } catch (err) {
    logger.error({ err, heartbeat: name }, '[internal/heartbeat] record failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, heartbeat: name, receivedAt });
}

export async function readHeartbeatVerdict(name: OperatorHeartbeatName): Promise<NextResponse> {
  const definition = findOperatorHeartbeat(name);
  if (!definition) {
    return NextResponse.json({ ok: false, error: 'unknown_heartbeat' }, { status: 404 });
  }
  enterWithDbInfraPrincipal({ source: `api/internal/heartbeat/${name}:GET` });
  try {
    const [row, overridesRaw] = await Promise.all([
      buildAppDeps().operatorHealthRead.getOperatorJobStatus(
        OPERATOR_HEARTBEAT_JOB_FAMILY,
        definition.jobKey,
      ),
      getConfigValue(OPERATOR_HEARTBEAT_CONFIG_KEY),
    ]);
    const verdict = classifyOperatorHeartbeat({
      name: definition.name,
      lastPingAt: row?.lastSuccessAt ?? null,
      staleAfterSec: resolveHeartbeatStaleAfterSec(
        definition,
        parseOperatorHeartbeatStaleOverrides(overridesRaw),
      ),
    });
    return NextResponse.json({ ok: true, verdict });
  } catch (err) {
    logger.error({ err, heartbeat: name }, '[internal/heartbeat] read failed');
    return NextResponse.json({ ok: false, error: 'internal_error' }, { status: 500 });
  }
}
