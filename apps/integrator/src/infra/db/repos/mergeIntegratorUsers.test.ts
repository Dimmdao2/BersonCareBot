import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../../kernel/contracts/index.js';
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
});
