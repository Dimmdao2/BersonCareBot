import type { FastifyInstance } from 'fastify';
import type { RubitimeRecordForLinking } from '../../db/repos/rubitimeRecords.js';
import type { RubitimeTelegramUser } from './webhook.js';
import { evaluateReqSuccessEligibility } from './reqSuccessEligibility.js';

type ReqSuccessIframeDeps = {
  getRecordByRubitimeId: (rubitimeRecordId: string) => Promise<RubitimeRecordForLinking | null>;
  findTelegramUserByPhone: (phoneNormalized: string) => Promise<RubitimeTelegramUser | null>;
};

const WINDOW_MINUTES = 20;

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
  const frameStyle = [
    'font-family:-apple-system,BlinkMacSystemFont,Segoe UI,Roboto,sans-serif;',
    'margin:0;',
    'padding:8px;',
    'background:transparent;',
  ].join('');

  if (!showButton) {
    return `<!doctype html><html><head><meta charset="utf-8"></head><body style="${frameStyle}"><div data-showbtn="false" data-record-id="${safeRecordId}" data-widget="rubitime-req-success"></div></body></html>`;
  }

  return `<!doctype html><html><head><meta charset="utf-8"></head><body style="${frameStyle}"><a data-showbtn="true" data-record-id="${safeRecordId}" data-widget="rubitime-req-success" href="${deepLink}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:10px 14px;border-radius:10px;background:#2AABEE;color:#fff;text-decoration:none;font-weight:600;">Получать подтверждения в Telegram</a></body></html>`;
}

export function registerRubitimeReqSuccessIframeRoute(
  app: FastifyInstance,
  deps: ReqSuccessIframeDeps,
): void {
  app.get('/api/rubitime', async (request, reply) => {
    const query = request.query as Record<string, unknown> | undefined;
    const recordSuccess = typeof query?.record_success === 'string' ? query.record_success.trim() : '';

    if (!recordSuccess) {
      reply.type('text/html; charset=utf-8');
      return reply.code(200).send(renderIframeHtml(false, ''));
    }

    const record = await deps.getRecordByRubitimeId(recordSuccess);
    const linkedUser =
      record?.phoneNormalized != null
        ? await deps.findTelegramUserByPhone(record.phoneNormalized)
        : null;

    const eligibility = evaluateReqSuccessEligibility({
      now: new Date(),
      windowMinutes: WINDOW_MINUTES,
      record,
      linkedUser,
    });

    reply.type('text/html; charset=utf-8');
    return reply.code(200).send(renderIframeHtml(eligibility.showButton, recordSuccess));
  });
}
