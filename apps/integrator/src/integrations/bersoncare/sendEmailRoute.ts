/**
 * Маршрут приёма запросов от webapp (bersoncare): отправка email с OTP-кодом.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow 5: send-email».
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { isMailerConfigured, sendMail } from '../email/mailer.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;

const sendEmailBodySchema = z.object({
  to: z.string().email(),
  subject: z.string().optional(),
  code: z.string(),
  templateId: z.string().optional(),
});

type SendEmailBody = z.infer<typeof sendEmailBodySchema>;

type ReqWithRawBody = FastifyRequest<{
  Body: SendEmailBody;
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

export type BersoncareSendEmailDeps = {
  sharedSecret: string;
};

export async function registerBersoncareSendEmailRoute(
  app: FastifyInstance,
  deps: BersoncareSendEmailDeps,
): Promise<void> {
  const { sharedSecret } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string =
        typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as SendEmailBody);
      } catch (e) {
        done(e as Error, undefined);
      }
    });
  }

  app.post<{ Body: SendEmailBody }>('/api/bersoncare/send-email', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare send-email: webhook secret not set (INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET)');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }
    if (!isMailerConfigured()) {
      return reply.code(503).send({ ok: false, error: 'email_not_configured' });
    }

    const parsed = sendEmailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    await sendMail({
      to: payload.to,
      subject: payload.subject ?? 'Код подтверждения BersonCare',
      text: `Ваш код BersonCare: ${payload.code}`,
    });

    return reply.code(200).send({ ok: true });
  });
}
