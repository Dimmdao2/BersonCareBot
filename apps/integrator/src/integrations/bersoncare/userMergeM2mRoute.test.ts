import { createHmac } from 'node:crypto';
import Fastify from 'fastify';
import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../infra/principal/organizationPrincipal.js';
import { registerBersoncareUserMergeM2mRoutes } from './userMergeM2mRoute.js';

const TEST_SECRET = 'test-user-merge-m2m-secret-min-16';

function sign(timestamp: string, rawBody: string): string {
  return createHmac('sha256', TEST_SECRET).update(`${timestamp}.${rawBody}`).digest('base64url');
}

/**
 * `mergeIntegratorUsers` locks winner/loser via `SELECT ... FOR UPDATE` as its very first statement
 * (inside `db.tx`). Returning the "loser already merged into winner" shape from the subsequent
 * `merged_into_user_id` select short-circuits to the idempotent `alreadyMerged` early-return before
 * any reparent UPDATE runs — the minimal path to observe the organization-principal context that was
 * active *during* the merge call without having to stub every reparent statement.
 */
function createAlreadyMergedDb(onLockQuery: () => void): DbPort {
  const query = vi.fn(async (q: string) => {
    if (q.includes('ORDER BY id ASC FOR UPDATE')) {
      onLockQuery();
      return { rows: [{ id: '1' }, { id: '2' }], rowCount: 2 };
    }
    if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
      return {
        rows: [
          { id: '1', merged_into_user_id: null },
          { id: '2', merged_into_user_id: '1' },
        ],
        rowCount: 2,
      };
    }
    return { rows: [], rowCount: 0 };
  }) as unknown as DbPort['query'];
  const db: DbPort = {
    query,
    tx: (async (fn: (d: DbPort) => unknown) => fn(db)) as unknown as DbPort['tx'],
  };
  return db;
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

  it('defect fix: runs the merge under the winner\'s resolved organization principal (per-user org)', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    let observedPrincipalDuringLock: string | undefined;
    const db = createAlreadyMergedDb(() => {
      observedPrincipalDuringLock = getCurrentOrganizationPrincipalId();
    });
    const resolveOrganizationIdForIntegratorUserId = vi.fn(async () => organizationId);
    const resolveDeploymentOrganizationId = vi.fn(async () => null);
    const app = Fastify();
    await registerBersoncareUserMergeM2mRoutes(app, {
      db,
      sharedSecret: TEST_SECRET,
      resolveOrganizationIdForIntegratorUserId,
      resolveDeploymentOrganizationId,
    });
    const body = JSON.stringify({ winnerIntegratorUserId: '1', loserIntegratorUserId: '2' });
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

    expect(res.statusCode).toBe(200);
    expect(resolveOrganizationIdForIntegratorUserId).toHaveBeenCalledWith('1');
    expect(resolveDeploymentOrganizationId).not.toHaveBeenCalled();
    expect(observedPrincipalDuringLock).toBe(organizationId);
    // Context must not leak past the request.
    expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
    await app.close();
  });

  it('defect fix: falls back to the deployment channel-binding organization when the winner has no per-user org context', async () => {
    const deploymentOrganizationId = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
    let observedPrincipalDuringLock: string | undefined;
    const db = createAlreadyMergedDb(() => {
      observedPrincipalDuringLock = getCurrentOrganizationPrincipalId();
    });
    // Winner has 0 or >1 active orgs (or is not yet enrolled) — per-user resolution comes back empty.
    const resolveOrganizationIdForIntegratorUserId = vi.fn(async () => null);
    const resolveDeploymentOrganizationId = vi.fn(async () => deploymentOrganizationId);
    const app = Fastify();
    await registerBersoncareUserMergeM2mRoutes(app, {
      db,
      sharedSecret: TEST_SECRET,
      resolveOrganizationIdForIntegratorUserId,
      resolveDeploymentOrganizationId,
    });
    const body = JSON.stringify({ winnerIntegratorUserId: '1', loserIntegratorUserId: '2' });
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

    expect(res.statusCode).toBe(200);
    expect(resolveOrganizationIdForIntegratorUserId).toHaveBeenCalledWith('1');
    expect(resolveDeploymentOrganizationId).toHaveBeenCalledTimes(1);
    expect(observedPrincipalDuringLock).toBe(deploymentOrganizationId);
    expect(getCurrentOrganizationPrincipalId()).toBeUndefined();
    await app.close();
  });

  it('merge: runs without a principal when no organization is resolvable (legacy no-op posture)', async () => {
    let observedPrincipalDuringLock: string | undefined;
    const db = createAlreadyMergedDb(() => {
      observedPrincipalDuringLock = getCurrentOrganizationPrincipalId();
    });
    const app = Fastify();
    // No resolver deps at all (same shape as routes.ts before this fix / other unwired callers).
    await registerBersoncareUserMergeM2mRoutes(app, { db, sharedSecret: TEST_SECRET });
    const body = JSON.stringify({ winnerIntegratorUserId: '1', loserIntegratorUserId: '2' });
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

    expect(res.statusCode).toBe(200);
    expect(observedPrincipalDuringLock).toBeUndefined();
    await app.close();
  });
});
