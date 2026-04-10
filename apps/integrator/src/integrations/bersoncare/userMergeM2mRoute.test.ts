import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import { registerBersoncareUserMergeM2mRoutes } from './userMergeM2mRoute.js';

const TEST_SECRET = 'test-user-merge-m2m-secret-min-16';

function sign(timestamp: string, rawBody: string): string {
  return createHmac('sha256', TEST_SECRET).update(`${timestamp}.${rawBody}`).digest('base64url');
}

describe('registerBersoncareUserMergeM2mRoutes', () => {
  it('canonical-pair: 401 on bad signature', async () => {
    const db = {
      query: vi.fn(),
      tx: vi.fn(),
    };
    const app = Fastify();
    await registerBersoncareUserMergeM2mRoutes(app, { db: db as never, sharedSecret: TEST_SECRET });
    const body = JSON.stringify({ integratorUserIdA: '1', integratorUserIdB: '2' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/users/canonical-pair',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad',
      },
      payload: body,
    });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('canonical-pair: returns sameCanonical when resolves match', async () => {
    const db = {
      query: vi.fn(async (sql: string) => {
        const s = String(sql);
        if (s.includes('FROM users') && s.includes('merged_into_user_id')) {
          return { rows: [{ merged_into_user_id: null }] };
        }
        return { rows: [] };
      }),
      tx: vi.fn(),
    };
    const app = Fastify();
    await registerBersoncareUserMergeM2mRoutes(app, { db: db as never, sharedSecret: TEST_SECRET });
    const body = JSON.stringify({ integratorUserIdA: '10', integratorUserIdB: '10' });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/users/canonical-pair',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': ts,
        'x-bersoncare-signature': sign(ts, body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body) as { ok: boolean; sameCanonical: boolean };
    expect(j.ok).toBe(true);
    expect(j.sameCanonical).toBe(true);
    await app.close();
  });

  it('merge: returns 400 for invalid user id', async () => {
    const db = {
      query: vi.fn(),
      tx: vi.fn(),
    };
    const app = Fastify();
    await registerBersoncareUserMergeM2mRoutes(app, { db: db as never, sharedSecret: TEST_SECRET });
    const body = JSON.stringify({ winnerIntegratorUserId: 'x', loserIntegratorUserId: '2' });
    const ts = String(Math.floor(Date.now() / 1000));
    const res = await app.inject({
      method: 'POST',
      url: '/api/integrator/users/merge',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': ts,
        'x-bersoncare-signature': sign(ts, body),
      },
      payload: body,
    });
    expect(res.statusCode).toBe(400);
    await app.close();
  });
});
