import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../db/runIntegratorSql.js', () => ({
  runIntegratorSql: vi.fn().mockResolvedValue({ rows: [] }),
}));

import { markUserChannelBotBlocked } from './userChannelBotBlocked.js';
import { runIntegratorSql } from '../../db/runIntegratorSql.js';
import { drizzleSqlFragmentToApproximateSql } from '../../db/drizzleSqlDebugText.js';

describe('markUserChannelBotBlocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('upserts by user_id + external_id when both are present', async () => {
    const db = {} as never;
    await markUserChannelBotBlocked(db, {
      platformUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      channel: 'telegram',
      externalId: '12345',
    });
    expect(runIntegratorSql).toHaveBeenCalledTimes(1);
    const sql = drizzleSqlFragmentToApproximateSql(vi.mocked(runIntegratorSql).mock.calls[0]![1]);
    expect(sql).toContain('INSERT INTO public.user_channel_bindings');
    expect(sql).toContain('ON CONFLICT (channel_code, external_id) DO UPDATE');
    expect(sql).toContain('bot_blocked_at');
  });

  it('updates by user_id when external_id is missing', async () => {
    const db = {} as never;
    await markUserChannelBotBlocked(db, {
      platformUserId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      channel: 'max',
    });
    const sql = drizzleSqlFragmentToApproximateSql(vi.mocked(runIntegratorSql).mock.calls[0]![1]);
    expect(sql).toContain('UPDATE public.user_channel_bindings');
    expect(sql).not.toContain('ON CONFLICT');
  });
});
