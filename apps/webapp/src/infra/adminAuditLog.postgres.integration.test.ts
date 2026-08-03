/**
 * Disposable-Postgres proof (Б1/Б3, #1081): admin audit log via `listAdminAuditLog`/
 * `countOpenAutoMergeConflicts`, exercising real SQL against `admin_audit_log`.
 *
 * Migrated off the shared dev DB (was `.devDb.integration.test.ts`, opt-in env flags never set
 * anywhere — never ran in CI). Adds a real-row fixture so the found branch is proven, not just
 * the empty/impossible-filter branch the original only checked.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { getPool } from '@/infra/db/client';
import { countOpenAutoMergeConflicts, listAdminAuditLog } from '@/infra/adminAuditLog';

const ACTION = 'b3_admin_audit_log_fixture';

describe('adminAuditLog (disposable Postgres)', () => {
  beforeAll(async () => {
    const client = await getPool().connect();
    try {
      await client.query('ALTER TABLE admin_audit_log DISABLE ROW LEVEL SECURITY');
      await client.query(
        `INSERT INTO admin_audit_log (action, status, resolved_at) VALUES ($1, 'ok', NULL)`,
        [ACTION],
      );
      await client.query(
        `INSERT INTO admin_audit_log (action, status, resolved_at) VALUES ('auto_merge_conflict', 'ok', NULL)`,
      );
    } finally {
      client.release();
    }
  });

  afterAll(async () => {
    await getPool().end();
  });

  it('listAdminAuditLog returns empty page for impossible action filter', async () => {
    const page = await listAdminAuditLog(getPool(), {
      page: 1,
      limit: 5,
      action: '__no_such_audit_action_for_smoke__',
    });
    expect(page.items).toEqual([]);
    expect(page.total).toBe(0);
  });

  it('listAdminAuditLog returns the real fixture row for its action', async () => {
    const page = await listAdminAuditLog(getPool(), {
      page: 1,
      limit: 5,
      action: ACTION,
    });
    expect(page.total).toBe(1);
    expect(page.items[0]?.action).toBe(ACTION);
  });

  it('countOpenAutoMergeConflicts counts the real unresolved fixture row', async () => {
    const n = await countOpenAutoMergeConflicts(getPool());
    expect(n).toBe(1);
  });
});
