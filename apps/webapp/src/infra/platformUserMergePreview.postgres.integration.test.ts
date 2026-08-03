/**
 * Disposable-Postgres proof (Б1/Б3, #1081): `buildMergePreview`/`searchMergeUsersForManualMerge`
 * (no writes).
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). The original picked "whatever client/phone happens to exist in
 * dev" and silently no-op'd its second `it` if none existed; this version inserts its own fixture
 * client with a phone so that branch is actually exercised instead of vacuously passing.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import {
  buildMergePreview,
  searchMergeUsersForManualMerge,
} from '@/infra/platformUserMergePreview';

const PHONE = '+79997654321';
let clientId: string;

describe('platformUserMergePreview (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE platform_users DISABLE ROW LEVEL SECURITY');
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO platform_users (display_name, role, phone_normalized)
         VALUES ($1, 'client', $2)
         RETURNING id`,
        ['B3 merge-preview fixture', PHONE],
      );
      clientId = inserted.rows[0]!.id;
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('searchMergeUsersForManualMerge returns [] for empty query without DB hit', async () => {
    const rows = await searchMergeUsersForManualMerge(getPool(), '   ', 10);
    expect(rows).toEqual([]);
  });

  it('searchMergeUsersForManualMerge runs read-only SELECT when query is non-empty', async () => {
    const suffix = PHONE.slice(-4);
    const rows = await searchMergeUsersForManualMerge(getPool(), suffix, 5);
    expect(Array.isArray(rows)).toBe(true);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.length).toBeLessThanOrEqual(5);
    expect(rows.some((r) => r.id === clientId)).toBe(true);
  });

  it('buildMergePreview returns same_id without touching DB writes', async () => {
    const preview = await buildMergePreview(getPool(), clientId, clientId);
    expect(preview.ok).toBe(false);
    if (preview.ok) throw new Error('expected same_id');
    expect(preview.error).toBe('same_id');
  });
});
