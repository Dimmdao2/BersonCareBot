/**
 * Маршрут приёма запросов от вебапп (bersoncare): отправка SMS с кодом подтверждения.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow: BersonCare → Integrator (send SMS)».
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { SmsClient } from '../smsc/types.js';
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
  smsClient: SmsClient;
  sharedSecret: string;
};

export async function registerBersoncareSendSmsRoute(
  app: FastifyInstance,
  deps: BersoncareSendSmsDeps,
): Promise<void> {
  const { smsClient, sharedSecret } = deps;

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
      logger.warn({}, 'bersoncare send-sms: INTEGRATOR_SHARED_SECRET not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const phone = typeof request.body?.phone === 'string' ? request.body.phone.trim() : '';
    const code = typeof request.body?.code === 'string' ? request.body.code.trim() : '';
    if (!phone || !code) {
      return reply.code(400).send({ ok: false, error: 'phone and code required' });
    }

    const result = await smsClient.sendSms({
      toPhone: phone,
      message: `Ваш код BersonCare: ${code}`,
    });

    if (!result.ok) {
      logger.warn({ phone: phone.slice(0, 6) + '…', error: result.error }, 'bersoncare send-sms: SMSC failed');
      return reply.code(502).send({ ok: false, error: result.error ?? 'sms_failed' });
    }
    return reply.code(200).send({ ok: true });
  });
}
