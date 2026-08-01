/**
 * M2M: webapp просит интегратор отправить в чат запрос контакта (Telegram reply keyboard / MAX inline request_contact).
 * Подпись — как relay-outbound / send-otp.
 *
 * **Дедуп `idempotencyKey`:** durable store `integrator.idempotency_keys` через `idempotencyPort`
 * (см. `DEDUP_TTL_MS`) — переживает рестарт процесса и общий для всех реплик, в отличие от прежнего
 * `Map` в памяти процесса. См. `INTEGRATOR_CONTRACT.md` Flow 6b.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DbPort, DispatchPort, IdempotencyPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { createDbWritePort } from '../../infra/db/writePort.js';
import { dispatchRequestContactToUser } from './dispatchRequestContact.js';

const WINDOW_SECONDS = 300;
const DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

const bodySchema = z.object({
  channel: z.enum(['telegram', 'max']),
  /** Внешний id пользователя в канале (= chat id для лички TG/MAX). */
  recipientId: z.string().min(1),
  idempotencyKey: z.string().min(1),
});

type Body = z.infer<typeof bodySchema>;
type ReqWithRawBody = FastifyRequest<{ Body: Body }> & { rawBody?: string };

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

export type BersoncareRequestContactDeps = {
  dispatchPort: DispatchPort;
  sharedSecret: string;
  db: DbPort;
  isAuthChannelEnabled: (channel: 'telegram' | 'max') => Promise<boolean>;
  resolveOrganizationIdForMessengerIdentity?: (
    externalId: string,
    resource: 'telegram' | 'max',
  ) => Promise<string | null>;
  /** T0.4 channel-binding fallback when the recipient has no per-user org context yet (see routes.ts). */
  resolveDeploymentOrganizationId?: () => Promise<string | null>;
  /** Durable dedup store (`integrator.idempotency_keys`) — survives process restarts/replicas. */
  idempotencyPort: IdempotencyPort;
};

export async function registerBersoncareRequestContactRoute(
  app: FastifyInstance,
  deps: BersoncareRequestContactDeps,
): Promise<void> {
  const {
    dispatchPort,
    sharedSecret,
    db,
    isAuthChannelEnabled,
    resolveOrganizationIdForMessengerIdentity,
    resolveDeploymentOrganizationId,
    idempotencyPort,
  } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as Body);
      } catch (e) {
        done(e as Error, undefined);
      }
    });
  }

  app.post<{ Body: Body }>('/api/bersoncare/request-contact', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare request-contact: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { channel, recipientId, idempotencyKey } = parsed.data;
    if (!(await isAuthChannelEnabled(channel))) {
      return reply.code(403).send({ ok: false, error: 'auth_channel_disabled' });
    }
    if (!(await idempotencyPort.tryAcquire(idempotencyKey, DEDUP_TTL_MS / 1000))) {
      logger.info({ idempotencyKey }, 'request-contact: duplicate, skipping');
      return reply.code(200).send({ ok: true, status: 'duplicate' });
    }

    const writePort = createDbWritePort({ db });

    try {
      const dispatchContact = (): Promise<void> =>
        dispatchRequestContactToUser({
          dispatchPort,
          writePort,
          channel,
          recipientId,
          correlationId: idempotencyKey,
        });
      let organizationId: string | null = null;
      if (resolveOrganizationIdForMessengerIdentity) {
        try {
          organizationId = await resolveOrganizationIdForMessengerIdentity(recipientId, channel);
        } catch {
          organizationId = null;
        }
      }
      if (!organizationId && resolveDeploymentOrganizationId) {
        try {
          organizationId = await resolveDeploymentOrganizationId();
          if (organizationId) {
            logger.info(
              { channel },
              'request-contact: no per-user org context, using deployment channel-binding fallback',
            );
          }
        } catch {
          organizationId = null;
        }
      }
      if (organizationId) {
        await runWithOrganizationPrincipal(organizationId, dispatchContact);
      } else {
        logger.warn(
          { channel },
          'request-contact: no organization resolvable for channel; dispatching without principal',
        );
        await dispatchContact();
      }
      logger.info({ channel }, 'request-contact: dispatched');
      return reply.code(200).send({ ok: true, status: 'accepted' });
    } catch (err) {
      await idempotencyPort.release?.(idempotencyKey);
      const codeErr = (err as { code?: number }).code ?? 0;
      const isClientError = codeErr >= 400 && codeErr < 500;
      logger.error({ err, channel }, 'request-contact: dispatch failed');
      if (isClientError) {
        return reply.code(400).send({ ok: false, error: 'dispatch_client_error' });
      }
      return reply.code(502).send({ ok: false, error: 'dispatch_failed' });
    }
  });
}
