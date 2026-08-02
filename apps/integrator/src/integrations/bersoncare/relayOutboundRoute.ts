/**
 * Маршрут relay-outbound: получает подписанный запрос от webapp и доставляет
 * сообщение в нужный мессенджер-канал пациента.
 * Контракт: webapp/INTEGRATOR_CONTRACT.md, раздел «Flow: relay-outbound».
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import { randomUUID } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  DbPort,
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { runWithOptionalOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { recordNotificationDeliveryAttemptBestEffort } from '../../infra/db/repos/notificationDeliveryAttempts.js';
import { isOutboundMessagePolicyDenied } from '../../infra/adapters/outboundMessagePolicy.js';
import { recordOperatorFailureIncident } from '../../infra/operatorIncident/reportOperatorFailure.js';
import { classifyOutboundProviderErrorClass } from '@bersoncare/operator-db-schema';

const WINDOW_SECONDS = 300;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

type ReqWithRawBody = FastifyRequest & { rawBody?: string };

const relayPayloadSchema = z
  .object({
    messageId: z.string().min(1),
    organizationId: z.string().uuid().optional(),
    channel: z.enum(['telegram', 'max', 'email', 'sms', 'web_push'] as const),
    recipient: z.string().min(1),
    text: z.string().min(1),
    /** Опц. HTML-тело письма (email-канал) — мапится в payload.html для email-адаптера. */
    html: z.string().optional(),
    idempotencyKey: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
    senderScope: z.literal('clinic_required').optional(),
    purpose: z.never().optional(),
  })
  .superRefine((value, ctx) => {
    if (value.channel === 'web_push' && !value.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'organizationId required',
      });
    }
    if (value.channel === 'web_push' && !z.string().uuid().safeParse(value.recipient).success) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['recipient'],
        message: 'web_push recipient must be UUID',
      });
    }
  });

type RelayPayload = z.infer<typeof relayPayloadSchema>;

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

function buildIntent(parsed: RelayPayload): OutgoingIntent | null {
  const meta = {
    eventId: parsed.messageId,
    occurredAt: new Date().toISOString(),
    source: parsed.channel,
    correlationId: parsed.idempotencyKey,
  };

  if (parsed.channel === 'telegram' || parsed.channel === 'max') {
    const rawMarkup = parsed.metadata?.replyMarkup;
    const replyMarkup =
      rawMarkup !== null &&
      typeof rawMarkup === 'object' &&
      Array.isArray((rawMarkup as { inline_keyboard?: unknown }).inline_keyboard)
        ? (rawMarkup as { inline_keyboard: unknown[] })
        : undefined;
    const recipient =
      parsed.channel === 'max' ? { userId: parsed.recipient } : { chatId: parsed.recipient };
    return {
      type: 'message.send' as const,
      meta,
      payload: {
        recipient,
        message: { text: parsed.text },
        ...(replyMarkup ? { replyMarkup } : {}),
        delivery: {
          channels: [parsed.channel],
          ...(parsed.senderScope ? { senderScope: parsed.senderScope } : {}),
        },
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
        delivery: {
          channels: ['smsc'],
          ...(parsed.senderScope ? { senderScope: parsed.senderScope } : {}),
        },
      },
    };
  }

  if (parsed.channel === 'email') {
    // D-S10: extend relay-outbound to carry email intents (N4 APPROVED §5b).
    // subject comes from optional metadata.subject; falls back to 'BersonCare'.
    // payload shape matches EmailDeliveryAdapter expectations (S8):
    //   payload.recipient.email, payload.subject, payload.message.text, payload.delivery.channels.
    const subject =
      typeof parsed.metadata?.subject === 'string' && parsed.metadata.subject.trim()
        ? parsed.metadata.subject.trim()
        : 'BersonCare';
    return {
      type: 'message.send' as const,
      meta,
      payload: {
        recipient: { email: parsed.recipient },
        subject,
        message: { text: parsed.text },
        ...(parsed.html ? { html: parsed.html } : {}),
        delivery: {
          channels: ['email'],
          ...(parsed.senderScope ? { senderScope: parsed.senderScope } : {}),
        },
      },
    };
  }

  if (parsed.channel === 'web_push') {
    // S14a: extend relay-outbound to carry web_push intents (N4 APPROVED §5b).
    // recipient = pushUserId (integrator/webapp user id whose subscriptions receive the push).
    // Push content comes from text (body) + metadata (title, url, pushExtras).
    // payload shape matches WebPushDeliveryAdapter expectations (S14):
    //   payload.recipient.pushUserId, payload.message.text (body), payload.title,
    //   payload.url, payload.pushExtras, payload.delivery.channels.
    const title = typeof parsed.metadata?.title === 'string' ? parsed.metadata.title : 'BersonCare';
    const url = typeof parsed.metadata?.url === 'string' ? parsed.metadata.url : '/';
    const rawExtras = parsed.metadata?.pushExtras;
    const pushExtras =
      rawExtras !== null && typeof rawExtras === 'object' && !Array.isArray(rawExtras)
        ? (rawExtras as Record<string, unknown>)
        : undefined;
    return {
      type: 'message.send' as const,
      // The signed generic relay may create product-push capability only for Web Push.
      // It never accepts a class/capability field from the caller body.
      meta: {
        ...meta,
        source: 'web_push',
        outboundMessageClass: 'routine_product' as const,
        outboundCapability: 'app_push' as const,
      },
      payload: {
        recipient: { pushUserId: parsed.recipient },
        message: { text: parsed.text },
        title,
        url,
        ...(pushExtras ? { pushExtras } : {}),
        delivery: { channels: ['web_push'] },
      },
    };
  }

  return null;
}

async function recordRelayProviderFailureSafely(
  channel: Extract<RelayPayload['channel'], 'email' | 'sms'>,
  error: unknown,
): Promise<void> {
  const errorClass =
    channel === 'email'
      ? classifyOutboundProviderErrorClass(error instanceof Error ? error.message : String(error))
      : 'provider_send_failed';

  try {
    await recordOperatorFailureIncident({
      direction: 'outbound_delivery_provider',
      integration: channel === 'email' ? 'email' : 'smsc',
      errorClass,
      errorDetail: null,
    });
  } catch {
    logger.warn(
      { channel, errorClass: 'operator_incident_record_failed' },
      'relay-outbound: operator incident record failed',
    );
  }
}

export type BersoncareRelayOutboundDeps = {
  db?: DbPort;
  dispatchPort: DispatchPort;
  sharedSecret: string;
  isSmsProviderConnected?: () => Promise<boolean>;
  /** Durable dedup store (`integrator.idempotency_keys`) — survives process restarts/replicas. */
  idempotencyPort: IdempotencyPort;
};

export async function registerBersoncareRelayOutboundRoute(
  app: FastifyInstance,
  deps: BersoncareRelayOutboundDeps,
): Promise<void> {
  const { db, dispatchPort, sharedSecret, isSmsProviderConnected, idempotencyPort } = deps;

  // In-memory guard: closes duplicate dispatch from requests that overlap within this
  // process while the first is still in flight (returns 503 so the caller retries).
  // The durable "already delivered" check lives in idempotencyPort, which survives a
  // restart or a different replica handling the retry.
  const inFlight = new Set<string>();

  function scopedKey(payload: RelayPayload): string {
    return `${payload.organizationId ?? 'global'}:${payload.idempotencyKey}`;
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
      return reply
        .code(400)
        .send({ ok: false, error: 'invalid_payload', details: parseResult.error.flatten() });
    }

    const parsed = parseResult.data;

    if (parsed.channel === 'sms' && isSmsProviderConnected && !(await isSmsProviderConnected())) {
      logger.info(
        { channel: 'sms', messageId: parsed.messageId },
        'relay-outbound: SMS provider not connected, skipping',
      );
      return reply.code(200).send({ ok: true, status: 'skipped' });
    }

    const dedupKey = scopedKey(parsed);
    if (inFlight.has(dedupKey)) {
      return reply.code(503).send({ ok: false, error: 'dispatch_in_flight' });
    }
    if (!(await idempotencyPort.tryAcquire(dedupKey, DEDUP_TTL_MS / 1000))) {
      logger.info(
        { idempotencyKey: parsed.idempotencyKey },
        'relay-outbound: duplicate request, skipping',
      );
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }

    inFlight.add(dedupKey);
    const intent = buildIntent(parsed);
    if (!intent) {
      logger.warn(
        { channel: parsed.channel },
        'relay-outbound: unsupported channel, skipping dispatch',
      );
      inFlight.delete(dedupKey);
      return reply.code(200).send({ ok: true, status: 'accepted' });
    }

    try {
      const dispatchResult = await runWithOptionalOrganizationPrincipal(parsed.organizationId, () =>
        dispatchPort.dispatchOutgoing(intent),
      );
      inFlight.delete(dedupKey);
      if (db && parsed.channel === 'web_push') {
        const topicCode =
          typeof parsed.metadata?.pushExtras === 'object' && parsed.metadata.pushExtras !== null
            ? String((parsed.metadata.pushExtras as Record<string, unknown>).topicCode ?? '') ||
              undefined
            : undefined;
        await recordNotificationDeliveryAttemptBestEffort(db, {
          ...(parsed.organizationId ? { organizationId: parsed.organizationId } : {}),
          userId: parsed.recipient,
          channel: 'web_push',
          status: dispatchResult.webPushOutcome?.status ?? 'skipped',
          ...(dispatchResult.webPushOutcome?.reason
            ? { reason: dispatchResult.webPushOutcome.reason }
            : dispatchResult.webPushOutcome
              ? {}
              : { reason: 'no_provider_outcome' }),
          eventId: parsed.messageId,
          recipientRef: `web_push:${parsed.recipient.slice(-4)}`,
          ...(dispatchResult.webPushOutcome?.providerStatusCode !== undefined
            ? { providerStatusCode: dispatchResult.webPushOutcome.providerStatusCode }
            : {}),
          ...(dispatchResult.webPushOutcome?.providerErrorCode
            ? { errorMessage: dispatchResult.webPushOutcome.providerErrorCode }
            : {}),
          ...(topicCode ? { topicCode } : {}),
          intentType: 'relay_outbound',
          metadata: dispatchResult.webPushOutcome ?? {},
        });
      }
      logger.info(
        {
          channel: parsed.channel,
          messageId: parsed.messageId,
          recipient: parsed.recipient.slice(0, 6) + '…',
        },
        'relay-outbound: dispatched',
      );
      return reply.code(200).send({ ok: true, status: 'accepted' });
    } catch (err) {
      inFlight.delete(dedupKey);
      await idempotencyPort.release?.(dedupKey);
      if (isOutboundMessagePolicyDenied(err)) {
        logger.warn(
          { channel: parsed.channel, messageId: parsed.messageId },
          'relay-outbound: egress policy denied',
        );
        return reply.code(403).send({ ok: false, error: 'egress_policy_denied' });
      }
      if (parsed.channel === 'email' || parsed.channel === 'sms') {
        await recordRelayProviderFailureSafely(parsed.channel, err);
      }
      if (db && parsed.channel === 'web_push') {
        await recordNotificationDeliveryAttemptBestEffort(db, {
          ...(parsed.organizationId ? { organizationId: parsed.organizationId } : {}),
          userId: parsed.recipient,
          channel: 'web_push',
          status: 'failed',
          reason: 'dispatch_failed',
          eventId: parsed.messageId,
          recipientRef: `web_push:${parsed.recipient.slice(-4)}`,
          intentType: 'relay_outbound',
          errorMessage: err instanceof Error ? err.message : String(err),
        });
      }
      const code = (err as { code?: number }).code ?? 0;
      const isClientError = code >= 400 && code < 500;
      logger.error(
        { err, channel: parsed.channel, messageId: parsed.messageId },
        'relay-outbound: dispatch failed',
      );
      if (isClientError) {
        return reply.code(400).send({ ok: false, error: 'dispatch_client_error' });
      }
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    }
  });
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
