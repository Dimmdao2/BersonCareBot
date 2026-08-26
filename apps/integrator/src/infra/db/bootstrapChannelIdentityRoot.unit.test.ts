import { describe, expect, it } from 'vitest';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { runWithIntegratorPrincipal } from '../principal/organizationPrincipal.js';
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

  it('D25: an unknown/unresolved channel identity (root returns zero rows) creates nothing and does not fail the write', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        calls.push({ text, params });
        // Lookup-only root: unknown externalId → zero rows, no INSERT branch left in the SQL body.
        return { rows: [] as T[], rowCount: 0 };
      },
      async tx(): Promise<never> {
        throw new Error('bootstrap user.upsert must not receive a relation transaction');
      },
    };
    const port = createDbWritePort({ db });

    await expect(
      runWithDbBootstrapPrincipal({ source: 'bootstrap-unknown-actor-test' }, () =>
        port.writeDb({
          type: 'user.upsert',
          params: { resource: 'telegram', externalId: 'unknown-999', username: '@stranger' },
        }),
      ),
    ).resolves.toBeUndefined();

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('app.integrator_upsert_channel_identity');
  });
});

/**
 * D25 — the same exact named root, now unconditionally used for the organization/integrator
 * principal too (Telegram/MAX already resolved to an organization). Before this slice, this exact
 * principal shape (`runWithIntegratorPrincipal`, telegram/webhook.ts's common case) selected the
 * retired relation-writer path (`writeIdentityAndPreferencesDirect`, a `db.tx(...)`-opening direct
 * write) instead of the root above.
 *
 * `user.phone.link` / `app.integrator_bind_bootstrap_channel_phone` coverage that used to live here
 * is removed together with the action (identity cleanup 2026-08-26): webapp owns the
 * confirmed-phone write end-to-end, integrator no longer writes contact/merge state under any name.
 */
describe('user.upsert under organization/integrator principal', () => {
  it('user.upsert uses the exact named root, never a relation transaction', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        calls.push({ text, params });
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000778',
              account_created: false,
              channel_binding_inserted: false,
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error(
          'organization/integrator user.upsert must not receive a relation transaction',
        );
      },
    };
    const port = createDbWritePort({ db });

    await runWithIntegratorPrincipal(
      {
        organizationId: '00000000-0000-4000-8000-000000000abc',
        integratorUserId: '42',
        source: 'integrator-channel-root-test',
      },
      () =>
        port.writeDb({
          type: 'user.upsert',
          params: { resource: 'telegram', externalId: '778', username: '@another_handle' },
        }),
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('app.integrator_upsert_channel_identity');
    expect(calls[0]?.params).toEqual(['telegram', '778', 'another_handle']);
  });
});
