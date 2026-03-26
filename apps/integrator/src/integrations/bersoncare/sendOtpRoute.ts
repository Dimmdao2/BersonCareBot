/**
 * OTP в мессенджер (Telegram / Max) от вебаппа.
 * Подпись и заголовки — как Flow 4 send-sms / relay-outbound.
 */
import { createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;

const bodySchema = z.object({
  channel: z.enum(['telegram', 'max']),
  recipientId: z.string().min(1),
  code: z.string().min(4).max(8),
});

type SendOtpBody = z.infer<typeof bodySchema>;

type ReqWithRawBody = FastifyRequest<{
  Body: SendOtpBody;
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

export type BersoncareSendOtpDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
};

export async function registerBersoncareSendOtpRoute(
  app: FastifyInstance,
  deps: BersoncareSendOtpDeps,
): Promise<void> {
  const { dispatchPort, sharedSecret } = deps;

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

    const { channel, recipientId, code } = parsed.data;
    const text = `Код для входа в BersonCare: ${code}`;
    const eventId = `otp:${channel}:${randomUUID()}`;
    const intent = {
      type: 'message.send' as const,
      meta: {
        eventId,
        occurredAt: new Date().toISOString(),
        source: channel,
        // Не включаем OTP/recipient в correlationId, чтобы не утекало в delivery logs.
        correlationId: `otp-dispatch:${eventId}`,
      },
      payload: {
        recipient: { chatId: recipientId },
        message: { text },
        delivery: { channels: [channel] },
      },
    };

    try {
      await dispatchPort.dispatchOutgoing(intent);
      return reply.code(200).send({ ok: true });
    } catch (err) {
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
