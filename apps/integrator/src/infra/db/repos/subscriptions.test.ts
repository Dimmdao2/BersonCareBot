import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  getUserSubscriptions,
  toggleUserSubscription,
  upsertUserSubscription,
} from './subscriptions.js';

function createDbMock() {
  const queryMock = vi.fn();
  const txMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: txMock as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('subscriptions repo (canonical user_id)', () => {
  it('reads subscriptions by canonical user_id', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [{ topic_id: 1 }], rowCount: 1 } as DbQueryResult);

    const res = await getUserSubscriptions(db, 42);

    expect(res).toEqual(new Set([1]));
    const [sql, params] = query.mock.calls[0] ?? [];
    const sqlText = String(sql);
    expect(sqlText).toContain('FROM user_subscriptions');
    expect(sqlText).toContain('user_id=$1');
    expect(sqlText).not.toContain('telegram_users');
    expect(params).toEqual([42]);
  });

  it('upserts subscription by canonical user_id', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);

    await upsertUserSubscription(db, 7, 3, true);

    const [sql, params] = query.mock.calls[0] ?? [];
    const sqlText = String(sql);
    expect(sqlText).toContain('INSERT INTO user_subscriptions');
    expect(sqlText).toContain('ON CONFLICT (user_id, topic_id)');
    expect(sqlText).not.toContain('telegram_users');
    expect(params).toEqual([7, 3, true]);
  });

  it('toggles subscription by canonical user_id', async () => {
    const { db, query } = createDbMock();
    query
      .mockResolvedValueOnce({ rows: [{ is_active: false }], rowCount: 1 } as DbQueryResult)
      .mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);

    const next = await toggleUserSubscription(db, 7, 9);

    expect(next).toBe(true);
    const [selectSql] = query.mock.calls[0] ?? [];
    expect(String(selectSql)).toContain('FROM user_subscriptions');
    const [upsertSql] = query.mock.calls[1] ?? [];
    expect(String(upsertSql)).toContain('INSERT INTO user_subscriptions');
  });
});
