import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { resolveCanonicalIntegratorUserId } from '../../infra/db/repos/canonicalUserId.js';
import {
  mergeIntegratorUsers,
  MergeIntegratorUsersError,
} from '../../infra/db/repos/mergeIntegratorUsers.js';

const WINDOW_SECONDS = 300;

const canonicalBodySchema = z.object({
  integratorUserIdA: z.string().min(1),
  integratorUserIdB: z.string().min(1),
});

const mergeBodySchema = z.object({
  winnerIntegratorUserId: z.string().min(1),
  loserIntegratorUserId: z.string().min(1),
  dryRun: z.boolean().optional(),
});

type CanonicalBody = z.infer<typeof canonicalBodySchema>;
type MergeBody = z.infer<typeof mergeBodySchema>;
type ReqWithRawBody = FastifyRequest & { rawBody?: string };

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

export type BersoncareUserMergeM2mDeps = {
  db: DbPort;
  sharedSecret: string;
};

/**
 * HMAC-signed M2M routes (same headers as settings sync / reminders): canonical pair check and integrator user merge.
 */
export async function registerBersoncareUserMergeM2mRoutes(
  app: FastifyInstance,
  deps: BersoncareUserMergeM2mDeps,
): Promise<void> {
  const { db, sharedSecret } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw));
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  app.post<{ Body: CanonicalBody }>('/api/integrator/users/canonical-pair', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare users/canonical-pair: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = canonicalBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { integratorUserIdA, integratorUserIdB } = parsed.data;
    try {
      const canonicalA = await resolveCanonicalIntegratorUserId(db, integratorUserIdA);
      const canonicalB = await resolveCanonicalIntegratorUserId(db, integratorUserIdB);
      const sameCanonical = canonicalA === canonicalB;
      return reply.code(200).send({
        ok: true,
        sameCanonical,
        canonicalA,
        canonicalB,
      });
    } catch (err) {
      logger.error({ err }, 'bersoncare users/canonical-pair: resolve failed');
      return reply.code(502).send({ ok: false, error: 'read_failed' });
    }
  });

  app.post<{ Body: MergeBody }>('/api/integrator/users/merge', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare users/merge: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = mergeBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { winnerIntegratorUserId, loserIntegratorUserId, dryRun } = parsed.data;

    try {
      const result = await mergeIntegratorUsers(
        db,
        winnerIntegratorUserId,
        loserIntegratorUserId,
        dryRun === true ? { dryRun: true } : {},
      );
      return reply.code(200).send({ ok: true, result });
    } catch (err) {
      if (err instanceof MergeIntegratorUsersError) {
        const missing = err.details?.missingIntegratorUserIds;
        return reply.code(400).send({
          ok: false,
          error: err.code,
          message: err.message,
          ...(missing != null && missing.length > 0 ? { missingIntegratorUserIds: missing } : {}),
        });
      }
      logger.error({ err }, 'bersoncare users/merge: merge failed');
      return reply.code(502).send({ ok: false, error: 'merge_failed' });
    }
  });
}
