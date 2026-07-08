import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { getCurrentOrganizationPrincipalId } from '../../principal/organizationPrincipal.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { runIntegratorSql } from '../runIntegratorSql.js';
import { expireOrphanedPendingReminderOccurrences } from './reminders.js';

vi.mock('../runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn(),
}));

function makeDb(): DbPort {
  const query = vi.fn().mockResolvedValue({ rows: [] }) as DbPort['query'];
  const tx = vi.fn(async <T>(fn: (txDb: DbPort) => Promise<T>) =>
    fn({ query, tx, integratorDrizzle: {} } as DbPort),
  ) as DbPort['tx'];
  return { query, tx } as DbPort;
}

describe('expireOrphanedPendingReminderOccurrences', () => {
  it('expires orphaned pending occurrences per organization transaction', async () => {
    const organizationId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const contexts: Array<string | undefined> = [];
    vi.mocked(runIntegratorSql).mockImplementation(async (_db, fragment) => {
      const sqlText = drizzleSqlFragmentToApproximateSql(fragment);
      if (sqlText.includes('SELECT DISTINCT COALESCE')) {
        return { rows: [{ organization_id: organizationId }] };
      }
      contexts.push(getCurrentOrganizationPrincipalId());
      return { rows: [] };
    });
    const db = makeDb();

    await expireOrphanedPendingReminderOccurrences(db, '2026-03-05T10:00:00.000Z');

    expect(db.tx).toHaveBeenCalledOnce();
    expect(contexts).toEqual([organizationId]);
    const updateFragment = vi.mocked(runIntegratorSql).mock.calls[1]?.[1];
    const updateSql = drizzleSqlFragmentToApproximateSql(updateFragment);
    expect(updateSql).toContain('UPDATE user_reminder_occurrences');
    expect(updateSql).toContain('COALESCE(o.organization_id, r.organization_id)');
  });
});
