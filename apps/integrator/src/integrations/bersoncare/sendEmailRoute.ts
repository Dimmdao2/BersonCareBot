/**
 * Маршрут приёма запросов от webapp (bersoncare): отправка email с OTP-кодом.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow 5: send-email».
 *
 * Dispatches only the existing authentication-code email through dispatchPort (the chokepoint)
 * instead of calling sendMail directly. Generic text/template email is intentionally rejected by
 * the route and by the central egress policy.
 *
 * email_not_configured: pre-checked via resolveSmtpOutboundConfig + isResolvedMailerConfigured
 * before dispatch, so callers still receive a 503 synchronously when SMTP is not set up.
 *
 * OTP safety: when a `code` is present the eventId is prefixed with `otp:email:` so that
 * sanitizePayloadForLogs (dispatchPort) redacts the code from the canonical delivery journal (PLAN S9 DoD).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DispatchPort, DbPort, IdempotencyPort } from '../../kernel/contracts/index.js';
import { resolveSmtpOutboundConfig } from '../../config/smtpOutbound.js';
import { isResolvedMailerConfigured } from '../email/mailer.js';
import { messageToIntent } from '../../infra/adapters/channelRouting.js';
import { isOutboundMessagePolicyDenied } from '../../infra/adapters/outboundMessagePolicy.js';
import type { UnifiedOutgoingMessage } from '../../kernel/contracts/unifiedMessage.js';
import { logger } from '../../infra/observability/logger.js';
import {
  classifyOutboundProviderErrorClass,
  type OutboundProviderErrorClass,
} from '@bersoncare/operator-db-schema';

const WINDOW_SECONDS = 300;

const sendEmailBodySchema = z
  .object({
    to: z.string().email(),
    subject: z.string().optional(),
    code: z.string().optional(),
    text: z.string().optional(),
    templateId: z.string().optional(),
    idempotencyKey: z.string().min(1),
  })
  .refine((data) => Boolean(data.code?.trim() || data.text?.trim()), {
    message: 'code_or_text_required',
  });

type SendEmailBody = z.infer<typeof sendEmailBodySchema>;

type ReqWithRawBody = FastifyRequest<{
  Body: SendEmailBody;
}> & { rawBody?: string };

function verifySignature(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
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
  isAuthChannelEnabled: (channel: 'email') => Promise<boolean>;
  recordProviderFailure: (reason: OutboundProviderErrorClass) => Promise<void>;
  idempotencyPort: IdempotencyPort;
};

async function recordProviderFailureSafely(
  recordProviderFailure: BersoncareSendEmailDeps['recordProviderFailure'],
  reason: OutboundProviderErrorClass,
): Promise<void> {
  try {
    await recordProviderFailure(reason);
  } catch {
    logger.warn(
      { channel: 'email', errorClass: 'operator_incident_record_failed' },
      'bersoncare send-email: operator incident record failed',
    );
  }
}

export async function registerBersoncareSendEmailRoute(
  app: FastifyInstance,
  deps: BersoncareSendEmailDeps,
): Promise<void> {
  const {
    sharedSecret,
    db,
    dispatchPort,
    isAuthChannelEnabled,
    recordProviderFailure,
    idempotencyPort,
  } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
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
      logger.warn(
        {},
        'bersoncare send-email: webhook secret not set (INTEGRATOR_WEBHOOK_SECRET or INTEGRATOR_SHARED_SECRET)',
      );
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = sendEmailBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parsed.error.flatten() });
    }

    const payload = parsed.data;
    const isAuthCode = Boolean(payload.code?.trim());
    if (isAuthCode && !(await isAuthChannelEnabled('email'))) {
      return reply.code(403).send({ ok: false, error: 'auth_channel_disabled' });
    }

    // Provider readiness follows policy so a disabled channel cannot probe provider state.
    const resolved = await resolveSmtpOutboundConfig(db);
    if (!isResolvedMailerConfigured(resolved)) {
      await recordProviderFailureSafely(recordProviderFailure, 'provider_not_configured');
      return reply.code(503).send({ ok: false, error: 'email_not_configured' });
    }
    if (!(await idempotencyPort.tryAcquire(payload.idempotencyKey, 24 * 60 * 60))) {
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }

    const subject = isAuthCode ? 'Код подтверждения BersonCare' : (payload.subject ?? 'BersonCare');
    const text = isAuthCode ? `Ваш код BersonCare: ${payload.code}` : (payload.text?.trim() ?? '');

    // OTP safety: prefix eventId with 'otp:email:' when a code is present so that
    // sanitizePayloadForLogs (dispatchPort) redacts it from the canonical delivery journal.
    const eventId = payload.idempotencyKey;

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
        ...(isAuthCode
          ? { outboundMessageClass: 'auth_code' as const, outboundCapability: 'auth_code' as const }
          : {}),
      },
    };

    // Dispatch through the single chokepoint — the pre-fork dev redirect inside
    // dispatchOutgoing applies automatically (PLAN D7).
    try {
      await dispatchPort.dispatchOutgoing(messageToIntent(msg));
    } catch (error) {
      await idempotencyPort.release?.(payload.idempotencyKey);
      if (isOutboundMessagePolicyDenied(error)) {
        return reply.code(403).send({ ok: false, error: 'egress_policy_denied' });
      }
      // D-f: квота (`454 …`) и кончившиеся кредиты (`401 …`) обязаны получить собственный
      // класс инцидента, иначе первая молча ретраится, а вторая тонет в «проблема с учёткой».
      const errorClass = classifyOutboundProviderErrorClass(
        error instanceof Error ? error.message : String(error),
      );
      await recordProviderFailureSafely(recordProviderFailure, errorClass);
      logger.warn(
        { channel: 'email', errorClass },
        'bersoncare send-email: provider dispatch failed',
      );
      return reply.code(500).send({ ok: false, error: 'email_failed' });
    }

    return reply.code(200).send({ ok: true });
  });
}
