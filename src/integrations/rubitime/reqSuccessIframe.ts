import type { FastifyInstance } from 'fastify';
import type { RubitimeRecordForLinking } from '../../infra/db/repos/rubitimeRecords.js';
import type { TelegramUserByPhone } from '../../infra/db/repos/telegramUsers.js';
import { evaluateReqSuccessEligibility } from './reqSuccessEligibility.js';
import { renderRubitimeIframeHtml } from '../../content/rubitime/content.js';

/** HTTP route iframe-помощника Rubitime: показывать кнопку линковки или нет. */
type ReqSuccessIframeDeps = {
  getRecordByRubitimeId: (rubitimeRecordId: string) => Promise<RubitimeRecordForLinking | null>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<TelegramUserByPhone | null>;
  windowMinutes: number;
  delayMinMs: number;
  delayMaxMs: number;
  ipLimitPerMin: number;
  globalLimitPerMin: number;
};

type CounterEntry = {
  minuteBucket: number;
  count: number;
};

type RateLimiterState = {
  global: CounterEntry;
  byIp: Map<string, CounterEntry>;
};


/** Переводит время в минутный бакет для rate limiter. */
function getMinuteBucket(now: Date): number {
  return Math.floor(now.getTime() / 60000);
}

/** Инкрементирует счетчик в пределах минутного бакета. */
function incrementCounter(counter: CounterEntry, minuteBucket: number): number {
  if (counter.minuteBucket !== minuteBucket) {
    counter.minuteBucket = minuteBucket;
    counter.count = 0;
  }
  counter.count += 1;
  return counter.count;
}

/** Извлекает клиентский IP с учетом x-forwarded-for. */
function getClientIp(request: { ip?: string; headers: Record<string, unknown> }): string {
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0]?.trim() || request.ip || 'unknown';
  }
  return request.ip || 'unknown';
}

/** Проверяет лимиты запросов (глобально и по IP). */
function isRateAllowed(params: {
  now: Date;
  clientIp: string;
  ipLimitPerMin: number;
  globalLimitPerMin: number;
  rateState: RateLimiterState;
}): boolean {
  const minuteBucket = getMinuteBucket(params.now);
  const globalCount = incrementCounter(params.rateState.global, minuteBucket);
  if (globalCount > params.globalLimitPerMin) return false;

  const ipCounter = params.rateState.byIp.get(params.clientIp) ?? { minuteBucket, count: 0 };
  const ipCount = incrementCounter(ipCounter, minuteBucket);
  params.rateState.byIp.set(params.clientIp, ipCounter);
  return ipCount <= params.ipLimitPerMin;
}

/** Применяет случайную задержку для защиты endpoint от abuse. */
async function applyDelay(minMs: number, maxMs: number): Promise<void> {
  const low = Math.max(0, minMs);
  const high = Math.max(low, maxMs);
  const delay = low + Math.floor(Math.random() * (high - low + 1));
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

/** Регистрирует endpoint `/api/rubitime` для iframe-виджета Rubitime. */
export function registerRubitimeReqSuccessIframeRoute(
  app: FastifyInstance,
  deps: ReqSuccessIframeDeps,
): void {
  // ARCH-V3 MOVE
  // этот endpoint должен быть переведён на pipeline (step 12),
  // чтобы rubitime integration оставался только входным adapter-слоем
  const rateState: RateLimiterState = {
    global: { minuteBucket: -1, count: 0 },
    byIp: new Map(),
  };

  app.get('/api/rubitime', async (request, reply) => {
    const query = request.query as Record<string, unknown> | undefined;
    const recordSuccess = typeof query?.record_success === 'string' ? query.record_success.trim() : '';
    const now = new Date();
    const clientIp = getClientIp({
      ip: request.ip,
      headers: request.headers as Record<string, unknown>,
    });

    const allowed = isRateAllowed({
      now,
      clientIp,
      ipLimitPerMin: deps.ipLimitPerMin,
      globalLimitPerMin: deps.globalLimitPerMin,
      rateState,
    });
    const renderAndReturn = async (showButton: boolean, recordId: string) => {
      await applyDelay(deps.delayMinMs, deps.delayMaxMs);
      reply.type('text/html; charset=utf-8');
      return reply.code(200).send(renderRubitimeIframeHtml(showButton, recordId));
    };

    if (!allowed) return renderAndReturn(false, '');
    if (!recordSuccess) return renderAndReturn(false, '');

    // ARCH-V3 MOVE
    // этот код должен быть перенесён в domain/context loader (доступ к данным и eligibility)
    const record = await deps.getRecordByRubitimeId(recordSuccess);
    const linkedUser =
      record?.phoneNormalized != null
        ? await deps.findTelegramUserByPhone(record.phoneNormalized)
        : null;

    const eligibility = evaluateReqSuccessEligibility({
      now,
      windowMinutes: deps.windowMinutes,
      record,
      linkedUser,
    });

    return renderAndReturn(eligibility.showButton, recordSuccess);
  });
}
