import { describe, expect, it, vi } from 'vitest';

import { createPasswordChangeService } from './passwordChange';
import { canAccessDoctor } from '@/modules/roles/service';

const userId = '00000000-0000-4000-8000-000000000017';

describe('authenticated password change lifecycle', () => {
  it('keeps the existing global-admin role eligible for the staff security boundary', () => {
    expect(canAccessDoctor('admin')).toBe(true);
  });

  it('replaces the verified credential, revokes old sessions, and returns the rotated admin user', async () => {
    let storedPassword = 'current-password';
    let sessionEpoch = 7;
    const verify = vi.fn(async (_email: string, password: string) =>
      password === storedPassword
        ? { ok: true as const, userId, emailVerified: true }
        : {
            ok: false as const,
            attempts: 1,
            retryAfterSeconds: 0,
            captchaRequired: false,
            captchaRefreshRequired: false,
            locked: false,
          },
    );
    const updatePasswordHash = vi.fn(async (_id: string, _email: string, hash: string) => {
      storedPassword = hash;
    });
    const revokeStaffSessions = vi.fn(async () => 9);
    const invalidateSessionsForSelf = vi.fn(async () => {
      sessionEpoch += 1;
    });
    const findByUserId = vi.fn(async () => ({
      userId,
      role: 'admin' as const,
      displayName: 'Platform admin',
      bindings: {},
      sessionEpoch,
    }));
    const service = createPasswordChangeService({
      credentials: { tryVerifyLogin: verify, updatePasswordHash },
      users: {
        getVerifiedEmailForUser: async () => 'admin@example.test',
        invalidateSessionsForSelf,
        findByUserId,
      },
      staffSecurity: {
        getStatus: async () => ({
          enrolled: true,
          recoveryConfirmed: true,
          replacementRequired: false,
          lockedUntil: null,
          sessionVersion: 8,
        }),
        revokeSessions: revokeStaffSessions,
      },
      hashPassword: async (password) => password,
    });

    const result = await service.changePassword({
      userId,
      currentPassword: 'current-password',
      newPassword: 'new-password-1074',
    });

    expect(result).toMatchObject({
      ok: true,
      user: { role: 'admin', sessionEpoch: 8 },
    });
    expect((await verify('admin@example.test', 'current-password')).ok).toBe(false);
    expect((await verify('admin@example.test', 'new-password-1074')).ok).toBe(true);
    expect(updatePasswordHash.mock.invocationCallOrder[0]).toBeLessThan(
      revokeStaffSessions.mock.invocationCallOrder[0]!,
    );
    expect(revokeStaffSessions.mock.invocationCallOrder[0]).toBeLessThan(
      invalidateSessionsForSelf.mock.invocationCallOrder[0]!,
    );
    expect(invalidateSessionsForSelf.mock.invocationCallOrder[0]).toBeLessThan(
      findByUserId.mock.invocationCallOrder[0]!,
    );
  });

  it('returns an explicit verified-email/password eligibility result without role disabling', async () => {
    const updatePasswordHash = vi.fn();
    const invalidateSessionsForSelf = vi.fn();
    const service = createPasswordChangeService({
      credentials: { tryVerifyLogin: vi.fn(), updatePasswordHash },
      users: {
        getVerifiedEmailForUser: async () => null,
        invalidateSessionsForSelf,
        findByUserId: vi.fn(),
      },
      staffSecurity: { getStatus: vi.fn(), revokeSessions: vi.fn() },
      hashPassword: vi.fn(),
    });

    await expect(
      service.changePassword({
        userId,
        currentPassword: 'current-password',
        newPassword: 'new-password-1074',
      }),
    ).resolves.toEqual({ ok: false, error: 'password_login_unavailable' });
    expect(updatePasswordHash).not.toHaveBeenCalled();
    expect(invalidateSessionsForSelf).not.toHaveBeenCalled();
  });

  it('refuses a wrong current password before credential or session mutation', async () => {
    const updatePasswordHash = vi.fn();
    const invalidateSessionsForSelf = vi.fn();
    const revokeSessions = vi.fn();
    const service = createPasswordChangeService({
      credentials: {
        tryVerifyLogin: async () => ({
          ok: false,
          attempts: 1,
          retryAfterSeconds: 0,
          captchaRequired: false,
          captchaRefreshRequired: false,
          locked: false,
        }),
        updatePasswordHash,
      },
      users: {
        getVerifiedEmailForUser: async () => 'admin@example.test',
        invalidateSessionsForSelf,
        findByUserId: vi.fn(),
      },
      staffSecurity: { getStatus: vi.fn(), revokeSessions },
      hashPassword: vi.fn(),
    });

    await expect(
      service.changePassword({
        userId,
        currentPassword: 'wrong-password',
        newPassword: 'new-password-1074',
      }),
    ).resolves.toMatchObject({ ok: false, error: 'wrong_current_password' });
    expect(updatePasswordHash).not.toHaveBeenCalled();
    expect(revokeSessions).not.toHaveBeenCalled();
    expect(invalidateSessionsForSelf).not.toHaveBeenCalled();
  });

  it('does not revoke sessions when credential replacement itself fails', async () => {
    const invalidateSessionsForSelf = vi.fn();
    const revokeSessions = vi.fn();
    const service = createPasswordChangeService({
      credentials: {
        tryVerifyLogin: async () => ({ ok: true, userId, emailVerified: true }),
        updatePasswordHash: async () => {
          throw new Error('credential_store_unavailable');
        },
      },
      users: {
        getVerifiedEmailForUser: async () => 'admin@example.test',
        invalidateSessionsForSelf,
        findByUserId: vi.fn(),
      },
      staffSecurity: {
        getStatus: async () => null,
        revokeSessions,
      },
      hashPassword: async () => 'hash',
    });

    await expect(
      service.changePassword({
        userId,
        currentPassword: 'current-password',
        newPassword: 'new-password-1074',
      }),
    ).rejects.toThrow('credential_store_unavailable');
    expect(revokeSessions).not.toHaveBeenCalled();
    expect(invalidateSessionsForSelf).not.toHaveBeenCalled();
  });
});
