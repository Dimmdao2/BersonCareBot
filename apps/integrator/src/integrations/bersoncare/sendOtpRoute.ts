/**
 * OTP в мессенджер (Telegram / Max) от вебаппа.
 * Подпись и заголовки — как Flow 4 send-sms / relay-outbound.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { maxUserRecipient } from '../../integrations/max/maxRecipient.js';
import type {
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { runWithOptionalOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  mailProfileRequestSchema,
  resolveAndRenderAuthCodeMailProfile,
} from '../email/mailProfile.js';

const WINDOW_SECONDS = 300;

const bodySchema = z
  .object({
    channel: z.enum(['telegram', 'max']),
    recipientId: z.string().min(1),
    code: z.string().min(4).max(8),
    mailProfile: mailProfileRequestSchema,
    idempotencyKey: z.string().min(1),
    organizationId: z.string().uuid().optional(),
    senderScope: z.literal('clinic_required').optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channel === 'max' && !/^[1-9]\d*$/u.test(value.recipientId.trim())) {
      ctx.addIssue({
        code: 'custom',
        path: ['recipientId'],
        message: 'positive MAX platform user id required',
      });
    }
  });

type SendOtpBody = z.infer<typeof bodySchema>;

type ReqWithRawBody = FastifyRequest<{
  Body: SendOtpBody;
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

export type BersoncareSendOtpDeps = {
  db: DbPort;
  dispatchPort: DispatchPort;
  sharedSecret: string;
  idempotencyPort: IdempotencyPort;
};

export async function registerBersoncareSendOtpRoute(
  app: FastifyInstance,
  deps: BersoncareSendOtpDeps,
): Promise<void> {
  const { db, dispatchPort, sharedSecret, idempotencyPort } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as SendOtpBody);
      } catch (e) {
        done(e as Error, undefined);
      }
    });
  }

  app.post<{ Body: SendOtpBody }>('/api/bersoncare/send-otp', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare send-otp: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { channel, recipientId, code, idempotencyKey, mailProfile, organizationId, senderScope } =
      parsed.data;
    if (senderScope === 'clinic_required' && !organizationId) {
      return reply.code(400).send({ ok: false, error: 'organization_required' });
    }
    if (!(await idempotencyPort.tryAcquire(idempotencyKey, 24 * 60 * 60))) {
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }
    const rendered = await resolveAndRenderAuthCodeMailProfile({ db, profile: mailProfile, code });
    const text = rendered.text;
    const eventId = idempotencyKey;
    const recipient = channel === 'max' ? maxUserRecipient(recipientId) : { chatId: recipientId };
    const intent: OutgoingIntent = {
      type: 'message.send' as const,
      meta: {
        eventId,
        occurredAt: new Date().toISOString(),
        source: channel,
        outboundMessageClass: 'auth_code',
        outboundCapability: 'auth_code',
        // Не включаем OTP/recipient в correlationId, чтобы не утекало в delivery logs.
        correlationId: `otp-dispatch:${eventId}`,
      },
      payload: {
        recipient,
        message: { text },
        delivery: {
          channels: [channel],
          ...(senderScope === 'clinic_required' ? { senderScope } : {}),
        },
      },
    };

    try {
      await runWithOptionalOrganizationPrincipal(organizationId, () => dispatchPort.dispatchOutgoing(intent));
      return reply.code(200).send({ ok: true });
    } catch (err) {
      await idempotencyPort.release?.(idempotencyKey);
      const codeErr = (err as { code?: number }).code ?? 0;
      const isClientError = codeErr >= 400 && codeErr < 500;
      logger.error({ err, channel }, 'bersoncare send-otp: dispatch failed');
      if (isClientError) {
        return reply.code(400).send({ ok: false, error: 'dispatch_client_error' });
      }
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    }
  });
}
