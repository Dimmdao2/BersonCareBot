import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import type { DbPort } from '../../kernel/contracts/index.js';
import * as appTimezone from '../../config/appTimezone.js';
import { registerBersoncareSettingsSyncRoute } from './settingsSyncRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function sign(timestamp: string, rawBody: string, secret = TEST_SECRET): string {
  return createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function makeHeaders(rawBody: string, secret = TEST_SECRET) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': sign(timestamp, rawBody, secret),
  };
}

describe('POST /api/integrator/settings/sync', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  function makeDbPort(mockQuery: ReturnType<typeof vi.fn>): DbPort {
    const self: DbPort = {
      query: mockQuery as DbPort['query'],
      tx: async <T>(fn: (inner: DbPort) => Promise<T>) => fn(self),
    };
    return self;
  }

  it('accepts valid signed payload and upserts', async () => {
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = Fastify();
    await registerBersoncareSettingsSyncRoute(app, {
      db: makeDbPort(query),
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({
      key: 'sms_fallback_enabled',
      scope: 'admin',
      valueJson: { value: true },
      updatedBy: 'user-1',
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/settings/sync',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true });
    expect(query).toHaveBeenCalledTimes(1);
    const sql = query.mock.calls[0]?.[0] as string | undefined;
    expect(sql).toContain('INSERT INTO system_settings');
  });

  it('invalidates app display timezone cache when key is app_display_timezone', async () => {
    // eslint-disable-next-line no-secrets/no-secrets -- method name for vi.spyOn
    const invalidateSpy = vi.spyOn(appTimezone, 'invalidateAppDisplayTimezoneCache');
    const query = vi.fn().mockResolvedValue({ rows: [] });
    const app = Fastify();
    await registerBersoncareSettingsSyncRoute(app, {
      db: makeDbPort(query),
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({
      key: 'app_display_timezone',
      scope: 'admin',
      valueJson: { value: 'Europe/Samara' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/settings/sync',
      headers: makeHeaders(body),
      body,
    });

    expect(res.statusCode).toBe(200);
    expect(invalidateSpy).toHaveBeenCalledTimes(1);
  });

  it('returns 401 for invalid signature', async () => {
    const query = vi.fn();
    const app = Fastify();
    await registerBersoncareSettingsSyncRoute(app, {
      db: makeDbPort(query),
      sharedSecret: TEST_SECRET,
    });

    const body = JSON.stringify({
      key: 'dev_mode',
      scope: 'admin',
      valueJson: { value: false },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/settings/sync',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad-signature',
      },
      body,
    });

    expect(res.statusCode).toBe(401);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'invalid_signature' });
    expect(query).not.toHaveBeenCalled();
  });
});
