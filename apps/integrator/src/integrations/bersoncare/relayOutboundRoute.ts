/**
 * Маршрут relay-outbound: получает подписанный запрос от webapp и доставляет
 * сообщение в нужный мессенджер-канал пациента.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow: relay-outbound».
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';

const WINDOW_SECONDS = 300;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type ReqWithRawBody = FastifyRequest & { rawBody?: string };

const relayPayloadSchema = z.object({
  messageId: z.string().min(1),
  channel: z.enum(['telegram', 'max', 'email', 'sms'] as const),
  recipient: z.string().min(1),
  text: z.string().min(1),
  idempotencyKey: z.string().min(1),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

type RelayPayload = z.infer<typeof relayPayloadSchema>;

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

function buildIntent(parsed: RelayPayload) {
  const meta = {
    eventId: parsed.messageId,
    occurredAt: new Date().toISOString(),
    source: parsed.channel,
    correlationId: parsed.idempotencyKey,
  };

  if (parsed.channel === 'telegram' || parsed.channel === 'max') {
    return {
      type: 'message.send' as const,
      meta,
      payload: {
        recipient: { chatId: parsed.recipient },
        message: { text: parsed.text },
        delivery: { channels: [parsed.channel] },
      },
    };
  }

  if (parsed.channel === 'sms') {
    return {
      type: 'message.send' as const,
      meta,
      payload: {
        recipient: { phoneNormalized: parsed.recipient },
        message: { text: parsed.text },
        delivery: { channels: ['smsc'] },
      },
    };
  }

  // email — not yet implemented; return null to signal skip
  return null;
}

export type BersoncareRelayOutboundDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
};

export async function registerBersoncareRelayOutboundRoute(
  app: FastifyInstance,
  deps: BersoncareRelayOutboundDeps,
): Promise<void> {
  const { dispatchPort, sharedSecret } = deps;

  // In-memory dedup: key → expiry timestamp
  const dedupMap = new Map<string, number>();

  function isDuplicate(key: string): boolean {
    const exp = dedupMap.get(key);
    if (exp === undefined) return false;
    if (Date.now() > exp) {
      dedupMap.delete(key);
      return false;
    }
    return true;
  }

  function registerKey(key: string): void {
    dedupMap.set(key, Date.now() + DEDUP_TTL_MS);
  }

  app.post('/api/bersoncare/relay-outbound', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});

    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }

    if (!sharedSecret) {
      logger.warn({}, 'bersoncare relay-outbound: shared secret not configured');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }

    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parseResult = relayPayloadSchema.safeParse(request.body);
    if (!parseResult.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload', details: parseResult.error.flatten() });
    }

    const parsed = parseResult.data;

    if (isDuplicate(parsed.idempotencyKey)) {
      logger.info({ idempotencyKey: parsed.idempotencyKey }, 'relay-outbound: duplicate request, skipping');
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }

    const intent = buildIntent(parsed);
    if (!intent) {
      logger.warn({ channel: parsed.channel }, 'relay-outbound: unsupported channel, skipping dispatch');
      registerKey(parsed.idempotencyKey);
      return reply.code(200).send({ ok: true, status: 'accepted' });
    }

    try {
      await dispatchPort.dispatchOutgoing(intent);
      registerKey(parsed.idempotencyKey);
      logger.info(
        { channel: parsed.channel, messageId: parsed.messageId, recipient: parsed.recipient.slice(0, 6) + '…' },
        'relay-outbound: dispatched',
      );
      return reply.code(200).send({ ok: true, status: 'accepted' });
    } catch (err) {
      const code = (err as { code?: number }).code ?? 0;
      const isClientError = code >= 400 && code < 500;
      logger.error({ err, channel: parsed.channel, messageId: parsed.messageId }, 'relay-outbound: dispatch failed');
      if (isClientError) {
        return reply.code(400).send({ ok: false, error: 'dispatch_client_error' });
      }
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    }
  });

  // Expose dedup map for testing via internal symbol
  (app as unknown as { _relayDedupMap?: Map<string, number> })._relayDedupMap = dedupMap;
}

/** Visible for testing: generate a valid HMAC signature for a body. */
export function signRelayRequest(timestamp: string, rawBody: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

/** Visible for testing: generate a proper relay request body. */
export function makeRelayBody(overrides: Partial<RelayPayload> = {}): RelayPayload {
  return {
    messageId: randomUUID(),
    channel: 'telegram',
    recipient: '123456789',
    text: 'hello',
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}
