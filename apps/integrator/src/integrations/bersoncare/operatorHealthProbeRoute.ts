/**
 * Защищённый trigger для синтетических проб MAX + Rubitime (подпись как у M2M webapp → integrator).
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { runOperatorHealthProbes } from '../../app/operatorHealthProbeRunner.js';

const WINDOW_SECONDS = 300;

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

export type OperatorHealthProbeRouteDeps = {
  sharedSecret: string;
  dispatchPort: DispatchPort;
};

export async function registerOperatorHealthProbeRoute(
  app: FastifyInstance,
  deps: OperatorHealthProbeRouteDeps,
): Promise<void> {
  const { sharedSecret, dispatchPort } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as Record<string, unknown>);
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  app.post('/internal/operator-health-probe', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret || sharedSecret.length < 16) {
      logger.warn({}, 'operator-health-probe: secret not configured');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    try {
      const result = await runOperatorHealthProbes({ dispatchPort });
      return reply.code(200).send({ ok: true, ...result });
    } catch (err) {
      logger.error({ err }, 'operator-health-probe failed');
      return reply.code(500).send({ ok: false, error: 'probe_run_failed' });
    }
  });
}
