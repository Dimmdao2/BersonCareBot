/**
 * M2M от webapp: обновление / отмена записи Rubitime (api2/update-record, remove-record).
 * Подпись как у send-sms / send-email.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '../../infra/observability/logger.js';
import { removeRubitimeRecord, updateRubitimeRecord } from './client.js';
import { rubitimeConfig } from './config.js';

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

function parseJsonRecordId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const id = (body as Record<string, unknown>).recordId;
  if (typeof id === 'number' && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  return null;
}

export type RubitimeRecordM2mDeps = {
  sharedSecret: string;
};

export async function registerRubitimeRecordM2mRoutes(
  app: FastifyInstance,
  deps: RubitimeRecordM2mDeps,
): Promise<void> {
  const { sharedSecret } = deps;

  const guard = (request: FastifyRequest): { ok: true; rawBody: string } | { ok: false; code: number; err: string } => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return { ok: false, code: 400, err: 'missing_headers' };
    }
    if (!sharedSecret) {
      logger.warn({}, 'rubitime m2m: webhook secret not set');
      return { ok: false, code: 503, err: 'service_unconfigured' };
    }
    if (!rubitimeConfig.apiKey) {
      return { ok: false, code: 503, err: 'rubitime_not_configured' };
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return { ok: false, code: 401, err: 'invalid_signature' };
    }
    return { ok: true, rawBody };
  };

  app.post('/api/bersoncare/rubitime/update-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    const patch =
      typeof request.body === 'object' && request.body !== null && 'patch' in request.body
        ? (request.body as { patch?: unknown }).patch
        : null;
    const data =
      typeof patch === 'object' && patch !== null && !Array.isArray(patch)
        ? (patch as Record<string, unknown>)
        : {};
    try {
      const result = await updateRubitimeRecord({ recordId, data });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime update-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/remove-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    try {
      const result = await removeRubitimeRecord({ recordId });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime remove-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });
}
