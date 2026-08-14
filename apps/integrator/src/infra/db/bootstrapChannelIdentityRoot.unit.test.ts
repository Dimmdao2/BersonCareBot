import { describe, expect, it } from 'vitest';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('user.upsert bootstrap boundary', () => {
  it('uses one exact named root and never opens a direct relation transaction', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        calls.push({ text, params });
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000777',
              account_created: true,
              channel_binding_inserted: true,
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error('bootstrap user.upsert must not receive a relation transaction');
      },
    };
    const port = createDbWritePort({ db });

    await runWithDbBootstrapPrincipal({ source: 'bootstrap-channel-root-test' }, () =>
      port.writeDb({
        type: 'user.upsert',
        params: { resource: 'telegram', externalId: '777', username: '@test_handle' },
      }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('app.integrator_upsert_channel_identity');
    expect(calls[0]?.params).toEqual(['telegram', '777', 'test_handle']);
  });

  it('binds the second-webhook phone through an exact root, not a relation transaction', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        calls.push({ text, params });
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000777',
              applied: true,
              failure_code: null,
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error('bootstrap user.phone.link must not receive a relation transaction');
      },
    };
    const port = createDbWritePort({ db, authChannelPolicy: async () => true });

    const result = await runWithDbBootstrapPrincipal(
      { source: 'bootstrap-phone-root-test' },
      () =>
        port.writeDb({
          type: 'user.phone.link',
          params: {
            resource: 'telegram',
            channelUserId: '777',
            phoneNormalized: '+79000000077',
          },
        }),
    );

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('app.integrator_bind_bootstrap_channel_phone');
    expect(calls[0]?.params).toEqual(['telegram', '777', '+79000000077', null]);
  });
});
