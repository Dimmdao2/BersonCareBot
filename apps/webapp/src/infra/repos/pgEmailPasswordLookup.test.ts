import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  db: { execute: vi.fn() },
  getWebappSqlDb: vi.fn(),
  runWebappNamedRoot: vi.fn(),
  runWebappSql: vi.fn(),
  runWebappTransaction: vi.fn(),
}));

vi.mock('@/infra/db/runWebappSql', () => ({
  getWebappSqlDb: fakes.getWebappSqlDb,
  runWebappNamedRoot: fakes.runWebappNamedRoot,
  runWebappSql: fakes.runWebappSql,
  runWebappTransaction: fakes.runWebappTransaction,
}));
vi.mock('@/infra/db/client', () => ({ getPool: vi.fn() }));
vi.mock('@/infra/adminAuditLog', () => ({ upsertOpenConflictLog: vi.fn() }));
vi.mock('@bersoncare/platform-merge', () => ({
  classifyMergeFailure: vi.fn(),
  mergePlatformUsersInTransaction: vi.fn(),
}));

import { createPgEmailPasswordLookupPort } from '@/infra/repos/pgEmailPasswordLookup';

/**
 * IDENTITY_AND_MERGE_SCHEME.md §2a item 7 (equal-rights login, migration 0342): the query now
 * joins `app.find_platform_user_ids_by_any_confirmed_email` so an account is found even when the
 * email is only its confirmed OAuth-linked secondary, not its primary — and such a match is
 * ALWAYS reported verified (a `user_oauth_bindings` row only exists because the provider already
 * vouched for it), never gated behind the primary's own `email_verified_at`.
 */
describe('createPgEmailPasswordLookupPort().resolveAuthState — equal-rights login', () => {
  const port = createPgEmailPasswordLookupPort();

  beforeEach(() => {
    vi.clearAllMocks();
    fakes.getWebappSqlDb.mockReturnValue(fakes.db);
  });

  it('a confirmed OAuth-linked secondary contact resolves to verified_with_password (equal-rights login)', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ id: 'user-1', email_verified: true, has_password: true }],
    });

    const result = await port.resolveAuthState('secondary@mail.ru');

    expect(result).toEqual({ kind: 'verified_with_password', userId: 'user-1' });
    expect(fakes.runWebappNamedRoot).toHaveBeenCalledTimes(1);
    const [db, identity, args] = fakes.runWebappNamedRoot.mock.calls[0] as unknown[];
    expect(db).toBe(fakes.db);
    expect(identity).toBe('app.pre_session_load_email_auth_state(text)');
    expect(args).toEqual(['secondary@mail.ru']);
    expect(fakes.runWebappSql).not.toHaveBeenCalled();
  });

  it('an email nobody has confirmed (not the primary, not any OAuth-linked secondary) resolves to free', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({ rows: [] });

    const result = await port.resolveAuthState('nobody@mail.ru');

    expect(result).toEqual({ kind: 'free' });
  });

  it('a primary email that exists but was never verified stays gated (needs_email_setup), unaffected by the secondary-contact widening', async () => {
    fakes.runWebappNamedRoot.mockResolvedValueOnce({
      rows: [{ id: 'user-2', email_verified: false, has_password: false }],
    });

    const result = await port.resolveAuthState('unverified-primary@mail.ru');

    expect(result).toEqual({ kind: 'needs_email_setup', userId: 'user-2' });
  });
});
