import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type {
  DispatchPort,
  IdempotencyPort,
  OutgoingIntent,
} from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { runWithOptionalOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { isOutboundMessagePolicyDenied } from '../../infra/adapters/outboundMessagePolicy.js';

const WINDOW_SECONDS = 300;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
type ReqWithRawBody = FastifyRequest & { rawBody?: string };

const schema = z
  .object({
    messageId: z.string().min(1),
    organizationId: z.string().uuid().optional(),
    channel: z.enum(['telegram', 'max', 'sms', 'email', 'web_push'] as const),
    recipient: z.string().min(1),
    text: z.string().min(1),
    idempotencyKey: z.string().min(1),
    metadata: z.record(z.string(), z.unknown()).optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.channel === 'web_push' && !value.organizationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['organizationId'],
        message: 'organizationId required',
      });
    }
    if (value.channel === 'web_push' && !z.string().uuid().safeParse(value.recipient).success) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['recipient'], message: 'UUID required' });
    }
  });
type Payload = z.infer<typeof schema>;

function validSignature(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts) || Math.abs(Math.floor(Date.now() / 1000) - ts) > WINDOW_SECONDS)
    return false;
  const expected = createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('base64url');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

function buildIntent(payload: Payload): OutgoingIntent {
  const meta = {
    eventId: payload.messageId,
    occurredAt: new Date().toISOString(),
    source: payload.channel,
    correlationId: payload.idempotencyKey,
    outboundMessageClass: 'operator_security' as const,
    outboundCapability: 'operator_alert' as const,
  };
  if (payload.channel === 'telegram' || payload.channel === 'max') {
    return {
      type: 'message.send',
      meta,
      payload: {
        recipient:
          payload.channel === 'max' ? { userId: payload.recipient } : { chatId: payload.recipient },
        message: { text: payload.text },
        delivery: { channels: [payload.channel] },
      },
    };
  }
  if (payload.channel === 'sms') {
    return {
      type: 'message.send',
      meta,
      payload: {
        recipient: { phoneNormalized: payload.recipient },
        message: { text: payload.text },
        delivery: { channels: ['smsc'] },
      },
    };
  }
  if (payload.channel === 'email') {
    const subject =
      typeof payload.metadata?.subject === 'string' && payload.metadata.subject.trim()
        ? payload.metadata.subject.trim()
        : 'BersonCare';
    return {
      type: 'message.send',
      meta,
      payload: {
        recipient: { email: payload.recipient },
        subject,
        message: { text: payload.text },
        delivery: { channels: ['email'] },
      },
    };
  }
  const extras = payload.metadata?.pushExtras;
  return {
    type: 'message.send',
    meta: { ...meta, source: 'web_push' },
    payload: {
      recipient: { pushUserId: payload.recipient },
      message: { text: payload.text },
      title: typeof payload.metadata?.title === 'string' ? payload.metadata.title : 'BersonCare',
      url: typeof payload.metadata?.url === 'string' ? payload.metadata.url : '/',
      ...(extras && typeof extras === 'object' && !Array.isArray(extras)
        ? { pushExtras: extras as Record<string, unknown> }
        : {}),
      delivery: { channels: ['web_push'] },
    },
  };
}

export type OperatorAlertRelayDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
  isSmsProviderReady: () => Promise<boolean>;
  /** Durable dedup store (`integrator.idempotency_keys`) — survives process restarts/replicas. */
  idempotencyPort: IdempotencyPort;
};

export async function registerOperatorAlertRelayRoute(
  app: FastifyInstance,
  deps: OperatorAlertRelayDeps,
): Promise<void> {
  // In-memory guard: closes duplicate dispatch from requests that overlap within this
  // process while the first is still in flight (returns 503 so the caller retries).
  // The durable "already delivered" check lives in deps.idempotencyPort, which survives
  // a restart or a different replica handling the retry.
  const inFlight = new Set<string>();
  app.post('/api/bersoncare/operator-alert-relay', async (request, reply) => {
    const rawBody = (request as ReqWithRawBody).rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string')
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    if (!deps.sharedSecret)
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    if (!validSignature(timestamp, rawBody, signature, deps.sharedSecret))
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    const payload = parsed.data;
    if (payload.channel === 'sms' && !(await deps.isSmsProviderReady())) {
      return reply.code(200).send({ ok: true, status: 'skipped' });
    }
    const key = `${payload.organizationId ?? 'global'}:${payload.idempotencyKey}`;
    if (inFlight.has(key)) return reply.code(503).send({ ok: false, error: 'dispatch_in_flight' });
    if (!(await deps.idempotencyPort.tryAcquire(key, DEDUP_TTL_MS / 1000)))
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    inFlight.add(key);
    try {
      await runWithOptionalOrganizationPrincipal(payload.organizationId, () =>
        deps.dispatchPort.dispatchOutgoing(buildIntent(payload)),
      );
      return reply.code(200).send({ ok: true, status: 'accepted' });
    } catch (error) {
      await deps.idempotencyPort.release?.(key);
      if (isOutboundMessagePolicyDenied(error))
        return reply.code(403).send({ ok: false, error: 'egress_policy_denied' });
      logger.error({ error, channel: payload.channel }, 'operator-alert relay dispatch failed');
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    } finally {
      inFlight.delete(key);
    }
  });
}
