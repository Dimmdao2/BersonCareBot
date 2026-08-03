import { beforeEach, describe, expect, it, vi } from 'vitest';

const runWebappPgTextMock = vi.hoisted(() => vi.fn());
const runWebappTransactionMock = vi.hoisted(() => vi.fn());

vi.mock('@/infra/db/runWebappSql', () => ({
  runWebappPgText: runWebappPgTextMock,
  runWebappTransaction: runWebappTransactionMock,
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
    runWebappPgTextMock.mockReset();
  });

  it('a confirmed OAuth-linked secondary contact resolves to verified_with_password (equal-rights login)', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: 'user-1', email_verified: true, has_password: true }],
    });

    const result = await port.resolveAuthState('secondary@mail.ru');

    expect(result).toEqual({ kind: 'verified_with_password', userId: 'user-1' });
    expect(runWebappPgTextMock).toHaveBeenCalledWith(
      expect.stringContaining('app.find_platform_user_ids_by_any_confirmed_email'),
      ['secondary@mail.ru'],
    );
  });

  it('an email nobody has confirmed (not the primary, not any OAuth-linked secondary) resolves to free', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({ rows: [] });

    const result = await port.resolveAuthState('nobody@mail.ru');

    expect(result).toEqual({ kind: 'free' });
  });

  it('a primary email that exists but was never verified stays gated (needs_email_setup), unaffected by the secondary-contact widening', async () => {
    runWebappPgTextMock.mockResolvedValueOnce({
      rows: [{ id: 'user-2', email_verified: false, has_password: false }],
    });

    const result = await port.resolveAuthState('unverified-primary@mail.ru');

    expect(result).toEqual({ kind: 'needs_email_setup', userId: 'user-2' });
  });
});
