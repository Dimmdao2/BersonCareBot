/**
 * Disposable-Postgres proof (Б1/Б3, #1081): load purge row shape via `getPurgePlatformUserRowForTests`
 * (no DELETE).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original picked "whatever client row exists in dev"; the
 * disposable clone starts empty, so this version inserts its own fixture client instead.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { getPurgePlatformUserRowForTests } from '@/infra/platformUserFullPurge';

let clientId: string;

describe('platformUserFullPurge (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role) VALUES ($1, 'client') RETURNING id`,
        ['B3 purge fixture'],
      );
      clientId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('getPurgePlatformUserRowForTests returns null for unknown user id', async () => {
    const row = await getPurgePlatformUserRowForTests('00000000-0000-4000-8000-00000000ffff');
    expect(row).toBeNull();
  });

  it('getPurgePlatformUserRowForTests loads a client row without mutating data', async () => {
    const row = await getPurgePlatformUserRowForTests(clientId);
    expect(row?.id).toBe(clientId);
    expect(row?.role).toBe('client');
  });
});
