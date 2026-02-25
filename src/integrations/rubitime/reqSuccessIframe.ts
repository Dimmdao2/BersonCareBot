import type { FastifyInstance } from 'fastify';
import type { RubitimeRecordForLinking } from '../../db/repos/rubitimeRecords.js';
import type { RubitimeTelegramUser } from './webhook.js';
import { evaluateReqSuccessEligibility } from './reqSuccessEligibility.js';

type ReqSuccessIframeDeps = {
  getRecordByRubitimeId: (rubitimeRecordId: string) => Promise<RubitimeRecordForLinking | null>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<RubitimeTelegramUser | null>;
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

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function renderIframeHtml(showButton: boolean, recordId: string): string {
  const safeRecordId = escapeHtml(recordId);
  const deepLink = `https://t.me/bersoncarebot?start=${encodeURIComponent(recordId)}`;

  if (!showButton) {
    return '';
  }

  return `<div id="success_info_container"><a href="${deepLink}" data-record-id="${safeRecordId}"><button type="button" id="tgbot_activate" name="bersontgbot" class="base-type btn">Получать напоминания в телеграм</button></a></div>`;
}

function getMinuteBucket(now: Date): number {
  return Math.floor(now.getTime() / 60000);
}

function incrementCounter(counter: CounterEntry, minuteBucket: number): number {
  if (counter.minuteBucket !== minuteBucket) {
    counter.minuteBucket = minuteBucket;
    counter.count = 0;
  }
  counter.count += 1;
  return counter.count;
}

function getClientIp(request: { ip?: string; headers: Record<string, unknown> }): string {
  const xff = request.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0]?.trim() || request.ip || 'unknown';
  }
  return request.ip || 'unknown';
}

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

async function applyDelay(minMs: number, maxMs: number): Promise<void> {
  const low = Math.max(0, minMs);
  const high = Math.max(low, maxMs);
  const delay = low + Math.floor(Math.random() * (high - low + 1));
  await new Promise<void>((resolve) => setTimeout(resolve, delay));
}

export function registerRubitimeReqSuccessIframeRoute(
  app: FastifyInstance,
  deps: ReqSuccessIframeDeps,
): void {
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
      return reply.code(200).send(renderIframeHtml(showButton, recordId));
    };

    if (!allowed) return renderAndReturn(false, '');
    if (!recordSuccess) return renderAndReturn(false, '');

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
