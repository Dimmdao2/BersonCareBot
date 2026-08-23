import { beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithDbBootstrapPrincipal } from '@bersoncare/db-principal';
import type { DbPort, DbQueryResult } from '../../kernel/contracts/index.js';
import { runWithIntegratorPrincipal } from '../principal/organizationPrincipal.js';

const fakes = vi.hoisted(() => ({ recordBlocked: vi.fn().mockResolvedValue(undefined) }));

vi.mock('./repos/messengerPhoneBindAudit.js', () => ({
  recordMessengerPhoneBindBlocked: fakes.recordBlocked,
}));

import { createDbWritePort } from './writePort.js';

beforeEach(() => {
  vi.clearAllMocks();
});

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
    const port = createDbWritePort({ db });

    const result = await runWithDbBootstrapPrincipal({ source: 'bootstrap-phone-root-test' }, () =>
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

  it('a bootstrap conflict stays fail-closed and does not create an org-scoped manual-review case (no organization is known yet)', async () => {
    const db: DbPort = {
      async query<T>(): Promise<DbQueryResult<T>> {
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000777',
              applied: false,
              failure_code: 'phone_owned_by_other_user',
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error('bootstrap user.phone.link must not receive a relation transaction');
      },
    };
    const port = createDbWritePort({ db });

    const result = await runWithDbBootstrapPrincipal(
      { source: 'bootstrap-phone-conflict-test' },
      () =>
        port.writeDb({
          type: 'user.phone.link',
          params: { resource: 'telegram', channelUserId: '777', phoneNormalized: '+79000000077' },
        }),
    );

    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'phone_owned_by_other_user',
    });
    expect(fakes.recordBlocked).not.toHaveBeenCalled();
  });
});

/**
 * D25 — the same two exact named roots, now unconditionally used for the organization/integrator
 * principal too (Telegram/MAX already resolved to an organization). Before this slice, this exact
 * principal shape (`runWithIntegratorPrincipal`, telegram/webhook.ts's common case) selected the
 * retired relation-writer path (`writeIdentityAndPreferencesDirect` / `applyMessengerPhonePublicBind`,
 * a `db.tx(...)`-opening direct write) instead of the root above.
 */
describe('user.upsert / user.phone.link under organization/integrator principal', () => {
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

  it('user.phone.link binds the second webhook through the exact root, preserving the success result', async () => {
    const calls: Array<{ text: string; params: unknown[] }> = [];
    const db: DbPort = {
      async query<T>(text: string, params: unknown[] = []): Promise<DbQueryResult<T>> {
        calls.push({ text, params });
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000778',
              applied: true,
              failure_code: null,
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error(
          'organization/integrator user.phone.link must not receive a relation transaction',
        );
      },
    };
    const port = createDbWritePort({ db });

    const result = await runWithIntegratorPrincipal(
      {
        organizationId: '00000000-0000-4000-8000-000000000abc',
        integratorUserId: '42',
        source: 'integrator-phone-root-test',
      },
      () =>
        port.writeDb({
          type: 'user.phone.link',
          params: { resource: 'telegram', channelUserId: '778', phoneNormalized: '+79000000078' },
        }),
    );

    expect(result).toEqual({ userPhoneLinkApplied: true });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.text).toContain('app.integrator_bind_bootstrap_channel_phone');
    expect(calls[0]?.params).toEqual(['telegram', '778', '+79000000078', null]);
    expect(fakes.recordBlocked).not.toHaveBeenCalled();
  });

  it('a conflict stays fail-closed and creates the same durable, repeat-aware manual-review case the retired relation-writer path used to record', async () => {
    const db: DbPort = {
      async query<T>(): Promise<DbQueryResult<T>> {
        return {
          rows: [
            {
              platform_user_id: '00000000-0000-4000-8000-000000000778',
              applied: false,
              failure_code: 'phone_owned_by_other_user',
            },
          ] as T[],
          rowCount: 1,
        };
      },
      async tx(): Promise<never> {
        throw new Error(
          'organization/integrator user.phone.link must not receive a relation transaction',
        );
      },
    };
    const port = createDbWritePort({ db });

    const result = await runWithIntegratorPrincipal(
      {
        organizationId: '00000000-0000-4000-8000-000000000abc',
        integratorUserId: '42',
        source: 'integrator-phone-conflict-test',
      },
      () =>
        port.writeDb({
          type: 'user.phone.link',
          params: { resource: 'telegram', channelUserId: '778', phoneNormalized: '+79000000078' },
        }),
    );

    expect(result).toEqual({
      userPhoneLinkApplied: false,
      phoneLinkReason: 'phone_owned_by_other_user',
    });
    // Fire-and-forget (matches the retired path's own convention) — await the microtask queue so the
    // background `recordMessengerPhoneBindBlocked` call has run before asserting on it.
    await vi.waitFor(() => expect(fakes.recordBlocked).toHaveBeenCalledTimes(1));
    expect(fakes.recordBlocked).toHaveBeenCalledWith(
      expect.objectContaining({
        reason: 'phone_owned_by_other_user',
        candidateIds: ['00000000-0000-4000-8000-000000000778'],
        details: expect.objectContaining({ channelCode: 'telegram', externalId: '778' }),
      }),
    );
  });
});
