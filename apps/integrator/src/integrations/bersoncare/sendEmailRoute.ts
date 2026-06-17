/**
 * Маршрут приёма запросов от webapp (bersoncare): отправка email с OTP-кодом.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow 5: send-email».
 *
 * S9: route now dispatches an email UnifiedOutgoingMessage through dispatchPort (the chokepoint)
 * instead of calling sendMail directly. P21 (auth OTP email) + P19 (specialist email) ride this
 * route and are now redirect-covered automatically (PLAN D7).
 *
 * email_not_configured: pre-checked via resolveSmtpOutboundConfig + isResolvedMailerConfigured
 * before dispatch, so callers still receive a 503 synchronously when SMTP is not set up.
 *
 * OTP safety: when a `code` is present the eventId is prefixed with `otp:email:` so that
 * sanitizePayloadForLogs (dispatchPort) redacts the code from delivery_attempt_logs (PLAN S9 DoD).
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DispatchPort, DbPort } from '../../kernel/contracts/index.js';
import { resolveSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { isResolvedMailerConfigured } from '../email/mailer.js';
import { messageToIntent } from '../../infra/adapters/channelRouting.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;

const sendEmailBodySchema = z
  .object({
    to: z.string().email(),
    subject: z.string().optional(),
    code: z.string().optional(),
    text: z.string().optional(),
    templateId: z.string().optional(),
  })
  .refine((data) => Boolean(data.code?.trim() || data.text?.trim()), {
    message: 'code_or_text_required',
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
  /** Used only for the email_not_configured pre-check (503 gate). Not used for delivery. */
  db: DbPort;
  /** The single chokepoint for email delivery (PLAN S9). */
  dispatchPort: DispatchPort;
};

export async function registerBersoncareSendEmailRoute(
  app: FastifyInstance,
  deps: BersoncareSendEmailDeps,
): Promise<void> {
  const { sharedSecret, db, dispatchPort } = deps;

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

    // email_not_configured pre-check: return 503 synchronously so callers know immediately
    // rather than failing later in the async delivery queue.
    const resolved = await resolveSmtpOutboundConfig(db);
    if (!isResolvedMailerConfigured(resolved)) {
      return reply.code(503).send({ ok: false, error: 'email_not_configured' });
    }

    const parsed = sendEmailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const subject = payload.subject ?? (payload.text ? 'BersonCare' : 'Код подтверждения BersonCare');
    const text =
      payload.text?.trim() ||
      (payload.code ? `Ваш код BersonCare: ${payload.code}` : '');

    // OTP safety: prefix eventId with 'otp:email:' when a code is present so that
    // sanitizePayloadForLogs (dispatchPort) redacts it from delivery_attempt_logs.
    const isOtp = Boolean(payload.code?.trim());
    const eventId = isOtp
      ? `otp:email:${randomUUID()}`
      : `email:send:${randomUUID()}`;

    const msg: UnifiedOutgoingMessage = {
      kind: 'message.send',
      channel: 'email',
      recipient: { email: payload.to },
      content: {
        subject,
        text,
      },
      meta: {
        eventId,
        occurredAt: new Date().toISOString(),
        source: 'email',
      },
    };

    // Dispatch through the single chokepoint — the pre-fork dev redirect inside
    // dispatchOutgoing applies automatically (PLAN D7).
    await dispatchPort.dispatchOutgoing(messageToIntent(msg));

    return reply.code(200).send({ ok: true });
  });
}
