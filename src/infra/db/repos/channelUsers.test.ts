import { describe, expect, it, vi } from 'vitest';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import {
  findByPhone,
  getNotificationSettings,
  getUserLinkData,
  getUserState,
  setUserPhone,
  setUserState,
  tryAdvanceLastUpdateId,
  upsertUser,
  updateNotificationSettings,
} from './channelUsers.js';

function createDbMock() {
  const queryMock = vi.fn();
  const txMock = vi.fn();
  const db: DbPort = {
    query: queryMock as unknown as DbPort['query'],
    tx: txMock as unknown as DbPort['tx'],
  };
  return { db, query: queryMock };
}

describe('channelUsers repo (identity/contact/state split)', () => {
  it('upsertUser uses canonical identities and telegram_state', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({
      rows: [{ id: '42', channel_id: '123' }],
      rowCount: 1,
    } as DbQueryResult<{ id: string; channel_id: string }>);

    const row = await upsertUser(db, {
      id: 123,
      username: 'alice',
      first_name: 'Alice',
      last_name: 'Example',
    });

    expect(row).toEqual({ id: '42', channel_id: '123' });
    expect(query).toHaveBeenCalledTimes(1);
    const [sql, params] = query.mock.calls[0] ?? [];
    const sqlText = String(sql);
    expect(sqlText).toContain('INSERT INTO identities');
    expect(sqlText).toContain('INSERT INTO telegram_state');
    expect(sqlText).toContain('INSERT INTO users');
    expect(params).toEqual(['123', 'alice', 'Alice', 'Example']);
  });

  it('set/get state operate via telegram_state joined with identities', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    await setUserState(db, '123', 'idle');

    const [setSql] = query.mock.calls[0] ?? [];
    expect(String(setSql)).toContain('INSERT INTO telegram_state');
    expect(String(setSql)).toContain("FROM identities i");

    query.mockResolvedValueOnce({
      rows: [{ state: 'idle' }],
      rowCount: 1,
    } as DbQueryResult<{ state: string | null }>);
    const state = await getUserState(db, '123');
    expect(state).toBe('idle');

    const [getSql] = query.mock.calls[1] ?? [];
    expect(String(getSql)).toContain('LEFT JOIN telegram_state');
    expect(String(getSql)).toContain("i.resource = 'telegram'");
  });

  it('setUserPhone writes canonical contact and keeps legacy mirror update', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);

    await setUserPhone(db, '123', '+79990001122');

    const [sql, params] = query.mock.calls[0] ?? [];
    const sqlText = String(sql);
    expect(sqlText).toContain('INSERT INTO contacts');
    expect(sqlText).toContain("WHERE i.resource = 'telegram'");
    expect(sqlText).toContain('UPDATE telegram_users');
    expect(params).toEqual(['123', '+79990001122']);
  });

  it('notification settings and dedup fields read/write through telegram_state', async () => {
    const { db, query } = createDbMock();

    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    await updateNotificationSettings(db, 123, { notify_spb: true, notify_online: false });
    const [updateSql] = query.mock.calls[0] ?? [];
    expect(String(updateSql)).toContain('INSERT INTO telegram_state');
    expect(String(updateSql)).toContain('ON CONFLICT (identity_id)');

    query.mockResolvedValueOnce({
      rows: [{ notify_spb: true, notify_msk: false, notify_online: false }],
      rowCount: 1,
    } as DbQueryResult<{
      notify_spb: boolean | null;
      notify_msk: boolean | null;
      notify_online: boolean | null;
    }>);
    const settings = await getNotificationSettings(db, 123);
    expect(settings).toEqual({ notify_spb: true, notify_msk: false, notify_online: false });

    query.mockResolvedValueOnce({ rows: [], rowCount: 1 } as DbQueryResult);
    const advanced = await tryAdvanceLastUpdateId(db, 123, 1001);
    expect(advanced).toBe(true);

    const [advanceSql] = query.mock.calls[2] ?? [];
    expect(String(advanceSql)).toContain('UPDATE telegram_state ts');
    expect(String(advanceSql)).toContain('ts.last_update_id');
  });

  it('lookup helpers resolve via contacts + identities + telegram_state', async () => {
    const { db, query } = createDbMock();
    query.mockResolvedValueOnce({
      rows: [{ channel_id: '123', username: 'alice' }],
      rowCount: 1,
    } as DbQueryResult<{ channel_id: string; username: string | null }>);

    const byPhone = await findByPhone(db, '+79990001122');
    expect(byPhone).toEqual({ chatId: 123, channelId: '123', username: 'alice' });

    const [findSql] = query.mock.calls[0] ?? [];
    const findSqlText = String(findSql);
    expect(findSqlText).toContain('FROM contacts c');
    expect(findSqlText).toContain('JOIN identities i');
    expect(findSqlText).toContain('LEFT JOIN telegram_state ts');

    query.mockResolvedValueOnce({
      rows: [{ channel_id: '123', username: 'alice', phone: '+79990001122' }],
      rowCount: 1,
    } as DbQueryResult<{ channel_id: string; username: string | null; phone: string | null }>);

    const byChannel = await getUserLinkData(db, '123');
    expect(byChannel).toEqual({
      chatId: 123,
      channelId: '123',
      username: 'alice',
      phoneNormalized: '+79990001122',
    });

    const [linkSql] = query.mock.calls[1] ?? [];
    const linkSqlText = String(linkSql);
    expect(linkSqlText).toContain('FROM identities i');
    expect(linkSqlText).toContain('LEFT JOIN LATERAL');
    expect(linkSqlText).toContain('FROM contacts c');
  });
});
