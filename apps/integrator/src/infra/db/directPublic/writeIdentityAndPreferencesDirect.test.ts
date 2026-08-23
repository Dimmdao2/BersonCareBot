/**
 * D25 (owner decision 23.08.2026): `upsertBootstrapChannelIdentity` is lookup-only — it MUST NOT
 * synthesize a result (and therefore must not signal "created") when the exact named root returns no
 * row. See module header for why: the SQL body itself no longer has an INSERT branch.
 */
import { describe, expect, it } from 'vitest';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult } from '../../../kernel/contracts/index.js';
import { upsertBootstrapChannelIdentity } from './writeIdentityAndPreferencesDirect.js';

describe('upsertBootstrapChannelIdentity — D25 lookup-only contract', () => {
  it('returns null (not a thrown error) when the root finds no existing binding for an unknown externalId', async () => {
    const db: DbPort = {
      async query<T>(): Promise<DbQueryResult<T>> {
        return { rows: [] as T[], rowCount: 0 };
      },
      async tx(): Promise<never> {
        throw new Error('lookup-only root must not open a relation transaction');
      },
    };

    const result = await runWithDbBootstrapPrincipal({ source: 'lookup-only-test' }, () =>
      upsertBootstrapChannelIdentity(db, { channelCode: 'telegram', externalId: 'unknown-1' }),
    );

    expect(result).toBeNull();
  });

  it('returns the resolved platform user id when the root finds an existing binding', async () => {
    const db: DbPort = {
      async query<T>(): Promise<DbQueryResult<T>> {
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000999',
              channel_binding_inserted: false,
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error('lookup-only root must not open a relation transaction');
      },
    };

    const result = await runWithDbBootstrapPrincipal({ source: 'lookup-only-test' }, () =>
      upsertBootstrapChannelIdentity(db, { channelCode: 'telegram', externalId: '999' }),
    );

    expect(result).toEqual({
      platformUserId: '00000000-0000-4000-8000-000000000999',
      channelBindingInserted: false,
      topicsWritten: 0,
    });
  });
});
