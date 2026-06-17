/**
 * Маршрут приёма запросов от вебапп (bersoncare): отправка SMS с кодом подтверждения.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow: BersonCare → Integrator (send SMS)».
 *
 * S6 (PLAN): no longer calls smsClient.sendSms directly — instead builds a `smsc`-channel
 * UnifiedOutgoingMessage and dispatches via dispatchPort (redirect-covered; smsc adapter delivers).
 * OTP redaction is preserved via the `otp:`-prefixed eventId (dispatchPort.ts::isOtpIntent).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { messageToIntent } from '../../infra/adapters/channelRouting.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;

type SendSmsBody = {
  phone?: string;
  code?: string;
  idempotencyKey?: string;
};

type ReqWithRawBody = FastifyRequest<{
  Body: SendSmsBody;
}> & { rawBody?: string };

function verifySignature(timestamp: string, rawBody: string, signature: string, secret: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WINDOW_SECONDS) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

export type BersoncareSendSmsDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
};

export async function registerBersoncareSendSmsRoute(
  app: FastifyInstance,
  deps: BersoncareSendSmsDeps,
): Promise<void> {
  const { dispatchPort, sharedSecret } = deps;

  app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
    const raw: string =
      typeof body === 'string' ? body : (body as Buffer).toString('utf8');
    (req as ReqWithRawBody).rawBody = raw;
    try {
      done(null, JSON.parse(raw) as SendSmsBody);
    } catch (e) {
      done(e as Error, undefined);
    }
  });

  app.post<{ Body: SendSmsBody }>('/api/bersoncare/send-sms', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare send-sms: webhook secret not set (INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET)');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const phone = typeof request.body?.phone === 'string' ? request.body.phone.trim() : '';
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    const idempotencyKey =
      typeof request.body?.idempotencyKey === 'string' ? request.body.idempotencyKey.trim() : '';
    if (!phone || !code) {
      return reply.code(400).send({ ok: false, error: 'phone and code required' });
    }

    // Build smsc-channel UnifiedOutgoingMessage and dispatch via the single chokepoint.
    // The `otp:` eventId prefix triggers OTP-redaction in dispatchPort::isOtpIntent,
    // so the SMS code is never logged. (PLAN S6, D3, D7)
    const intent = messageToIntent({
      kind: 'message.send',
      channel: 'smsc',
      recipient: { phoneNormalized: phone },
      content: { text: `Ваш код BersonCare: ${code}` },
      meta: {
        eventId: `otp:sms:${idempotencyKey || phone}`,
        occurredAt: new Date().toISOString(),
        source: 'smsc',
      },
    });

    try {
      await dispatchPort.dispatchOutgoing(intent);
    } catch (err) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.warn({ phone: phone.slice(0, 6) + '…', error: errMsg }, 'bersoncare send-sms: dispatch failed');
      return reply.code(502).send({ ok: false, error: 'sms_failed' });
    }

    return reply.code(200).send({ ok: true });
  });
}
