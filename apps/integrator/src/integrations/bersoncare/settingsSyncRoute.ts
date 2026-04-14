import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import type { DbPort } from '../../kernel/contracts/index.js';
import { logger } from '../../infra/observability/logger.js';
import { invalidateAppBaseUrlCache } from '../../config/appBaseUrl.js';
import { invalidateAppDisplayTimezoneCache } from '../../config/appTimezone.js';
import { invalidateGoogleCalendarConfigCache } from '../google-calendar/runtimeConfig.js';

const WINDOW_SECONDS = 300;

const bodySchema = z.object({
  key: z.string().min(1).max(256),
  scope: z.enum(['global', 'doctor', 'admin']),
  valueJson: z.unknown(),
  updatedBy: z.string().min(1).optional(),
});

type SettingsSyncBody = z.infer<typeof bodySchema>;
type ReqWithRawBody = FastifyRequest<{ Body: SettingsSyncBody }> & { rawBody?: string };

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

export type BersoncareSettingsSyncDeps = {
  db: DbPort;
  sharedSecret: string;
};

export async function registerBersoncareSettingsSyncRoute(
  app: FastifyInstance,
  deps: BersoncareSettingsSyncDeps,
): Promise<void> {
  const { db, sharedSecret } = deps;

  if (!app.hasContentTypeParser('application/json')) {
    app.addContentTypeParser('application/json', { parseAs: 'string' }, (req, body, done) => {
      const raw: string = typeof body === 'string' ? body : (body as Buffer).toString('utf8');
      (req as ReqWithRawBody).rawBody = raw;
      try {
        done(null, JSON.parse(raw) as SettingsSyncBody);
      } catch (err) {
        done(err as Error, undefined);
      }
    });
  }

  app.post<{ Body: SettingsSyncBody }>('/api/integrator/settings/sync', async (request, reply) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];

    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return reply.code(400).send({ ok: false, error: 'missing_headers' });
    }
    if (!sharedSecret) {
      logger.warn({}, 'bersoncare settings/sync: webhook secret not set');
      return reply.code(503).send({ ok: false, error: 'service_unconfigured' });
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return reply.code(401).send({ ok: false, error: 'invalid_signature' });
    }

    const parsed = bodySchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_payload' });
    }

    const { key, scope, valueJson, updatedBy } = parsed.data;

    try {
      await db.query(
        `INSERT INTO system_settings (key, scope, value_json, updated_at, updated_by)
         VALUES ($1, $2, $3::jsonb, NOW(), $4)
         ON CONFLICT (key, scope) DO UPDATE SET
           value_json = EXCLUDED.value_json,
           updated_at = NOW(),
           updated_by = EXCLUDED.updated_by`,
        [key, scope, JSON.stringify(valueJson), updatedBy ?? null],
      );
    } catch (err) {
      logger.error({ err }, 'bersoncare settings/sync: upsert failed');
      return reply.code(502).send({ ok: false, error: 'write_failed' });
    }

    if (key === 'app_base_url') {
      invalidateAppBaseUrlCache();
    }
    if (key === 'app_display_timezone') {
      invalidateAppDisplayTimezoneCache();
    }
    if (key.startsWith('google_')) {
      invalidateGoogleCalendarConfigCache();
    }

    return reply.code(200).send({ ok: true });
  });
}
