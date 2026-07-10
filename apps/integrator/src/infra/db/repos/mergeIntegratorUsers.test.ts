import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
import { drizzleSqlFragmentToApproximateSql } from '../drizzleSqlDebugText.js';
import { mergeIntegratorUsers, MergeIntegratorUsersError } from './mergeIntegratorUsers.js';

function createRecordingDb(): { db: DbPort; sql: string[]; queryImpl: ReturnType<typeof vi.fn> } {
  const sql: string[] = [];
  const queryImpl = vi.fn();
  const db: DbPort = {
    query: async (q: string, p?: unknown[]) => {
      sql.push(q);
      return queryImpl(q, p);
    },
    tx: async <T>(fn: (d: DbPort) => Promise<T>) => fn(db),
    integratorDrizzle: {
      execute: async (frag: unknown) => {
        const flat = drizzleSqlFragmentToApproximateSql(frag).replace(/^\s+/u, '').trim();
        sql.push(flat);
        return queryImpl(flat);
      },
    } as DbPort['integratorDrizzle'],
  };
  return { db, sql, queryImpl };
}

describe('mergeIntegratorUsers', () => {
  it('rejects invalid or same ids', async () => {
    const { db } = createRecordingDb();
    await expect(mergeIntegratorUsers(db, 'x', '2')).rejects.toMatchObject({
      code: 'INVALID_USER_ID',
    });
    await expect(mergeIntegratorUsers(db, '10', '10')).rejects.toMatchObject({
      code: 'SAME_USER',
    });
  });

  it('locks users in deterministic ascending id order', async () => {
    const { db, sql, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '5' }, { id: '20' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '20', merged_into_user_id: null },
            { id: '5', merged_into_user_id: null },
          ],
          rowCount: 2,
        };
      }
      if (q.includes('FROM identities li') && q.includes('JOIN identities wi')) {
        return { rows: [], rowCount: 0 };
      }
      if (q.startsWith('UPDATE identities SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM contacts')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE contacts SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM user_reminder_rules')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE user_reminder_rules SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE content_access_grants')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM user_subscriptions')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE user_subscriptions SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM mailing_logs')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE mailing_logs SET user_id')) return { rows: [], rowCount: 0 };
      if (q.includes('FROM projection_outbox') && q.includes('pending')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE projection_outbox')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE users SET merged_into_user_id')) return { rows: [], rowCount: 0 };
      return { rows: [], rowCount: 0 };
    });

    await mergeIntegratorUsers(db, '20', '5');

    const lockSql = sql.find((s) => s.includes('FOR UPDATE'));
    expect(lockSql).toBeDefined();
    expect(lockSql).toContain('ORDER BY id ASC');
    const outboxSql = sql.find((s) => s.includes('projection_outbox'));
    expect(outboxSql).toBeDefined();
    expect(outboxSql).toContain("status = 'pending'");

    const subsDedupSql = sql.find((s) => s.startsWith('DELETE FROM user_subscriptions'));
    expect(subsDedupSql).toBeDefined();
    expect(subsDedupSql).toContain('topic_id');
    expect(subsDedupSql).not.toContain('subscription_id');
  });

  it('throws when a user row is missing', async () => {
    const { db, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '1' }], rowCount: 1 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return { rows: [{ id: '1', merged_into_user_id: null }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(mergeIntegratorUsers(db, '1', '2')).rejects.toMatchObject({
      code: 'USER_NOT_FOUND',
      details: { missingIntegratorUserIds: ['2'] },
    });
  });

  it('returns alreadyMerged when loser already points to winner (idempotent)', async () => {
    const { db, sql, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
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
    });

    const r = await mergeIntegratorUsers(db, '1', '2');
    expect(r.alreadyMerged).toBe(true);
    expect(r.projectionOutboxPayloadRewrites).toBe(0);
    expect(sql.some((s) => s.includes('UPDATE identities'))).toBe(false);
  });

  it('throws ALREADY_MERGED_ALIAS when loser points to a different winner', async () => {
    const { db, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '1' }, { id: '2' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '1', merged_into_user_id: null },
            { id: '2', merged_into_user_id: '3' },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await expect(mergeIntegratorUsers(db, '1', '2')).rejects.toMatchObject({
      code: 'ALREADY_MERGED_ALIAS',
    });
  });

  it('dryRun returns without mutating domain tables', async () => {
    const { db, sql, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '1' }, { id: '2' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '1', merged_into_user_id: null },
            { id: '2', merged_into_user_id: null },
          ],
          rowCount: 2,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    const r = await mergeIntegratorUsers(db, '1', '2', { dryRun: true });
    expect(r.dryRun).toBe(true);
    expect(r.identitiesReassigned).toBe(0);
    expect(sql.some((s) => s.includes('UPDATE identities'))).toBe(false);
    expect(sql.some((s) => s.includes('UPDATE users SET merged_into_user_id'))).toBe(false);
  });

  it('cancels loser outbox row when winner key already exists (dedup)', async () => {
    const { db, queryImpl } = createRecordingDb();
    let outboxSelectDone = false;
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '10' }, { id: '99' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '99', merged_into_user_id: null },
            { id: '10', merged_into_user_id: null },
          ],
          rowCount: 2,
        };
      }
      if (q.includes('FROM identities li')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE identities SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM contacts')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE contacts SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM user_reminder_rules')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE user_reminder_rules SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE content_access_grants')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM user_subscriptions')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE user_subscriptions SET user_id')) return { rows: [], rowCount: 0 };
      if (q.startsWith('DELETE FROM mailing_logs')) return { rows: [], rowCount: 0 };
      if (q.startsWith('UPDATE mailing_logs SET user_id')) return { rows: [], rowCount: 0 };

      if (q.includes('FROM projection_outbox') && q.includes('pending') && !outboxSelectDone) {
        outboxSelectDone = true;
        return {
          rows: [
            {
              id: '500',
              event_type: 'user.upserted',
              idempotency_key: 'user.upserted:10:deadbeef',
              payload: { integratorUserId: '10', channelCode: 'telegram', externalId: '1' },
            },
          ],
          rowCount: 1,
        };
      }
      if (q.includes('FROM projection_outbox WHERE idempotency_key') && q.includes('AND id <>')) {
        return { rows: [{ id: '400' }], rowCount: 1 };
      }
      if (q.includes("status = 'cancelled'") && q.includes('merge:user deduped')) {
        return { rows: [], rowCount: 1 };
      }
      if (q.startsWith('UPDATE users SET merged_into_user_id')) return { rows: [], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });

    const r = await mergeIntegratorUsers(db, '99', '10');
    expect(r.projectionOutboxDedupedCancelled).toBe(1);
    expect(r.projectionOutboxIdempotencyRewrites).toBe(0);
    const cancelCalls = queryImpl.mock.calls.filter(
      (c) => typeof c[0] === 'string' && (c[0] as string).includes("status = 'cancelled'"),
    );
    expect(cancelCalls.length).toBeGreaterThanOrEqual(1);
  });

  it('exposes MergeIntegratorUsersError for alias rows', () => {
    expect(new MergeIntegratorUsersError('ALREADY_MERGED_ALIAS', 'x').code).toBe('ALREADY_MERGED_ALIAS');
  });

  it('T0.4: re-derives organization_id from the winner on every SCOPED re-parent, never leaving the loser stale org', async () => {
    const { db, sql, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '5' }, { id: '20' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '20', merged_into_user_id: null },
            { id: '5', merged_into_user_id: null },
          ],
          rowCount: 2,
        };
      }
      if (q.includes('FROM identities li') && q.includes('JOIN identities wi')) {
        return {
          rows: [{ loser_identity_id: '77', winner_identity_id: '88' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await mergeIntegratorUsers(db, '20', '5');

    const winnerOrgExpr = 'public.platform_users platform_user';
    const reparentStatements = [
      { prefix: 'UPDATE message_drafts SET identity_id', table: 'message_drafts' },
      { prefix: 'UPDATE conversations SET user_identity_id', table: 'conversations' },
      { prefix: 'UPDATE user_questions SET user_identity_id', table: 'user_questions' },
      { prefix: 'UPDATE contacts SET user_id', table: 'contacts' },
      { prefix: 'UPDATE user_reminder_rules SET user_id', table: 'user_reminder_rules' },
      { prefix: 'UPDATE content_access_grants SET user_id', table: 'content_access_grants' },
      { prefix: 'UPDATE user_subscriptions SET user_id', table: 'user_subscriptions' },
      { prefix: 'UPDATE mailing_logs SET user_id', table: 'mailing_logs' },
    ];

    for (const { prefix, table } of reparentStatements) {
      const statement = sql.find((s) => s.startsWith(prefix));
      expect(statement, `${table} reparent statement should exist`).toBeDefined();
      expect(statement, `${table} should stamp organization_id from the winner`).toContain('organization_id');
      expect(statement, `${table} org derivation should reference the winner's platform user`).toContain(
        winnerOrgExpr,
      );
      expect(statement, `${table} org derivation should key off winner id 20`).toContain(
        'integrator_user_id = 20',
      );
      // Defect fix (post-audit-71b05b493): the COALESCE's final fallback must be the row's OWN
      // current organization_id (not just principal / winner-single-active-org), so a winner with
      // 0 or >1 active orgs can never zero out a previously-valid organization_id.
      expect(
        statement,
        `${table} org derivation should fall back to its own existing organization_id, never NULL`,
      ).toContain(`${table}.organization_id`);
    }
  });

  it('defect fix: never NULLs a reparented row\'s organization_id when the winner has 0 active orgs', async () => {
    // Winner-single-active-org subquery below returns 0 rows (HAVING count = 1 fails when the
    // winner belongs to 0 orgs) and there is no organization principal in scope (no
    // runWithOrganizationPrincipal wrapper active in this unit test) — the OLD two-branch
    // COALESCE(principal, winnerSingleActiveOrg) would resolve to SQL NULL here, and every
    // reparent UPDATE would overwrite a previously-valid organization_id with NULL. The fix adds
    // `<table>.organization_id` as a third COALESCE branch so Postgres falls back to the row's own
    // current value instead. This test only asserts the generated SQL *shape* (COALESCE terminates
    // in `<table>.organization_id`) — proving the NULL-write is structurally impossible — since a
    // unit test against a recording DB double cannot execute real Postgres COALESCE evaluation.
    const { db, sql, queryImpl } = createRecordingDb();
    queryImpl.mockImplementation(async (q: string) => {
      if (q.includes('ORDER BY id ASC FOR UPDATE')) {
        return { rows: [{ id: '5' }, { id: '20' }], rowCount: 2 };
      }
      if (q.includes('merged_into_user_id') && q.includes('FROM users WHERE id IN')) {
        return {
          rows: [
            { id: '20', merged_into_user_id: null },
            { id: '5', merged_into_user_id: null },
          ],
          rowCount: 2,
        };
      }
      if (q.includes('FROM identities li') && q.includes('JOIN identities wi')) {
        // Non-empty so the per-pair reparents (message_drafts/conversations/user_questions) run too.
        return {
          rows: [{ loser_identity_id: '77', winner_identity_id: '88' }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    });

    await mergeIntegratorUsers(db, '20', '5');

    const reparentPrefixes = [
      'UPDATE message_drafts SET identity_id',
      'UPDATE conversations SET user_identity_id',
      'UPDATE user_questions SET user_identity_id',
      'UPDATE contacts SET user_id',
      'UPDATE user_reminder_rules SET user_id',
      'UPDATE content_access_grants SET user_id',
      'UPDATE user_subscriptions SET user_id',
      'UPDATE mailing_logs SET user_id',
    ];
    for (const prefix of reparentPrefixes) {
      const statement = sql.find((s) => s.startsWith(prefix));
      expect(statement, `${prefix} statement should exist`).toBeDefined();
      // COALESCE must end in the row's own organization_id column — never bare NULL.
      expect(statement).toMatch(/COALESCE\([^)]*organization_id[^)]*\)$|organization_id\s*\)\s*WHERE/u);
      const tableName = prefix.replace('UPDATE ', '').split(' ')[0];
      expect(
        statement,
        `${tableName} must reference its own organization_id as the terminal COALESCE fallback (>1-active-org / 0-active-org winner case)`,
      ).toContain(`${tableName}.organization_id`);
    }
  });
});
