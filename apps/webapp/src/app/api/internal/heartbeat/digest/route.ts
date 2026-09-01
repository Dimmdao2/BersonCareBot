import type { NextResponse } from 'next/server';
import { verifyInternalJobBearer } from '@/middleware/internalJobBearer';
import {
  readHeartbeatVerdict,
  recordHeartbeatPing,
} from '@/app-layer/operator-health/heartbeatReceiver';

/**
 * Локальный приёмник пульса «суточная сводка» (design D-d).
 *
 * Это НЕ замена внешнему сервису. Это приёмник, который мы контролируем, чтобы механизм
 * работал целиком уже сейчас и чтобы `OPERATOR_HEARTBEAT_DIGEST_URL` можно было позже
 * перевести на healthchecks-подобный сервис без изменения кода. В проде приёмник ОБЯЗАН
 * быть внешним: пульс, который излучает и принимает одна и та же коробка, ничего не
 * доказывает — это ошибка GitLab 2017-01-31, где канал алертов совпал с отказавшим каналом.
 *
 * POST — записать пульс. GET — прочитать вердикт (жив / пропал / не приходил ни разу).
 */

function authorize(request: Request): NextResponse | null {
  const auth = verifyInternalJobBearer(request);
  return auth.ok ? null : auth.response;
}

export async function POST(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return recordHeartbeatPing('digest');
}

export async function GET(request: Request) {
  const denied = authorize(request);
  if (denied) return denied;
  return readHeartbeatVerdict('digest');
}
