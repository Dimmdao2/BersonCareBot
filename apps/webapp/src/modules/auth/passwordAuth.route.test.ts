import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPasswordCredentialsPort } from '@/infra/repos/pgUserPasswordCredentials';
import type { PasswordAltchaService } from '@/modules/auth/passwordAltcha';
import type { PasswordChangeService } from '@/modules/auth/passwordChange';
import type { StaffSecurityService } from '@/modules/staff-security/service';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { AppSession, SessionUser } from '@/shared/types/session';

type CheckRateLimit = typeof import('@/modules/auth/authConfirmRateLimit').checkAuthConfirmRateLimit;
type ConsumeChallenge = typeof import('@/modules/auth/emailAuth').consumeEmailChallengeCode;
type ConsumeLatest = typeof import('@/modules/auth/emailAuth').consumeLatestEmailChallengeCodeForUser;
type HashPin = typeof import('@/modules/auth/pinHash').hashPin;
type RequireStaffSession =
  typeof import('@/app-layer/guards/requireRole').requireStaffSecurityApiSession;
type SetSession = typeof import('@/modules/auth/service').setSessionFromUser;

const fakes = vi.hoisted(() => ({
  checkRateLimit: vi.fn<CheckRateLimit>(),
  verifyAltcha: vi.fn<PasswordAltchaService['verify']>(),
  verifyPassword: vi.fn<UserPasswordCredentialsPort['verifyEmailPasswordForLogin']>(),
  findPasswordUser: vi.fn<UserPasswordCredentialsPort['findVerifiedUserIdWithPassword']>(),
  updatePassword: vi.fn<UserPasswordCredentialsPort['updatePasswordHash']>(),
  findUser: vi.fn<UserByPhonePort['findByUserId']>(),
  getVerifiedEmail: vi.fn<UserByPhonePort['getVerifiedEmailForUser']>(),
  invalidateSessions: vi.fn<UserByPhonePort['invalidateSessionsForSelf']>(),
  getSecurityStatus: vi.fn<StaffSecurityService['getStatus']>(),
  platformRequiresTwoFactor: vi.fn<() => Promise<boolean>>(),
  revokeStaffSessions: vi.fn<StaffSecurityService['revokeSessions']>(),
  changePassword: vi.fn<PasswordChangeService['changePassword']>(),
  consumeChallenge: vi.fn<ConsumeChallenge>(),
  consumeLatest: vi.fn<ConsumeLatest>(),
  hashPassword: vi.fn<HashPin>(),
  requireStaffSession: vi.fn<RequireStaffSession>(),
  setSession: vi.fn<SetSession>(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/guards/requireRole', () => ({
  requireStaffSecurityApiSession: fakes.requireStaffSession,
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: fakes.checkRateLimit,
}));
vi.mock('@/modules/auth/emailAuth', () => ({
  consumeEmailChallengeCode: fakes.consumeChallenge,
  consumeLatestEmailChallengeCodeForUser: fakes.consumeLatest,
  normalizeEmail: (value: string) => value.trim().toLowerCase(),
}));
vi.mock('@/modules/auth/pinHash', () => ({ hashPin: fakes.hashPassword }));
vi.mock('@/modules/staff-security/platformPolicy', () => ({
  platformRequiresStaffTwoFactor: fakes.platformRequiresTwoFactor,
}));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: fakes.setSession }));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    passwordAltcha: { verify: fakes.verifyAltcha },
    userPasswordCredentials: {
      verifyEmailPasswordForLogin: fakes.verifyPassword,
      findVerifiedUserIdWithPassword: fakes.findPasswordUser,
      updatePasswordHash: fakes.updatePassword,
    },
    userByPhone: {
      findByUserId: fakes.findUser,
      getVerifiedEmailForUser: fakes.getVerifiedEmail,
      invalidateSessionsForSelf: fakes.invalidateSessions,
    },
    staffSecurity: {
      getStatus: fakes.getSecurityStatus,
      revokeSessions: fakes.revokeStaffSessions,
    },
    passwordChange: { changePassword: fakes.changePassword },
  }),
}));

import { POST as login } from '@/app/api/auth/email-password/login/route';
import { POST as resetPassword } from '@/app/api/auth/email-password/reset/route';
import { POST as changePassword } from '@/app/api/account/security/password/change/route';

const userId = '00000000-0000-4000-8000-000000000107';
const user: SessionUser = {
  userId,
  role: 'doctor',
  displayName: 'Route test doctor',
  bindings: {},
  sessionEpoch: 7,
};
const session: AppSession = {
  user,
  issuedAt: 1_790_000_000,
  expiresAt: 1_790_043_200,
  staffSecurity: { assurance: 'factor_verified', verifiedAt: 1_790_000_000 },
};

function jsonRequest(path: string, body: object): Request {
  return new Request(`https://app.example.test${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.checkRateLimit.mockResolvedValue({ limited: false });
  fakes.verifyAltcha.mockResolvedValue(undefined);
  fakes.hashPassword.mockResolvedValue('hashed-for-route-test');
  fakes.getSecurityStatus.mockResolvedValue(null);
  fakes.platformRequiresTwoFactor.mockResolvedValue(false);
  fakes.invalidateSessions.mockResolvedValue(undefined);
  fakes.updatePassword.mockResolvedValue(undefined);
  fakes.requireStaffSession.mockResolvedValue({ ok: true, session });
  fakes.getVerifiedEmail.mockResolvedValue('person@example.test');
});

describe('email/password login HTTP boundary', () => {
  const request = () =>
    jsonRequest('/api/auth/email-password/login', {
      email: 'person@example.test',
      password: 'not-a-real-credential',
    });

  it('keeps credential failure and a missing identity projection on the same public failure', async () => {
    fakes.verifyPassword.mockResolvedValueOnce({
      ok: false,
      attempts: 1,
      retryAfterSeconds: 0,
      captchaRequired: false,
      captchaRefreshRequired: false,
      locked: false,
    });
    const wrongPassword = await login(request());
    fakes.verifyPassword.mockResolvedValueOnce({ ok: true, userId, emailVerified: true });
    fakes.findUser.mockResolvedValueOnce(null);
    const missingProjection = await login(request());

    const publicFailure = async (response: Response) => {
      const body = (await response.json()) as { error?: string; message?: string };
      return { status: response.status, error: body.error, message: body.message };
    };
    await expect(publicFailure(wrongPassword)).resolves.toEqual(
      await publicFailure(missingProjection),
    );
    expect(fakes.setSession).not.toHaveBeenCalled();
  });

  it('preserves the protection-port lockout outcome without issuing a session', async () => {
    fakes.verifyPassword.mockResolvedValue({
      ok: false,
      attempts: 10,
      retryAfterSeconds: 900,
      captchaRequired: true,
      captchaRefreshRequired: true,
      locked: true,
    });

    const response = await login(request());
    expect(response.status).toBe(401);
    expect(response.headers.get('retry-after')).toBe('900');
    await expect(response.json()).resolves.toMatchObject({
      error: 'invalid_credentials',
      retryAfterSeconds: 900,
      captchaRequired: true,
      captchaRefreshRequired: true,
    });
    expect(fakes.setSession).not.toHaveBeenCalled();
  });

  it('surfaces factor enrollment only when the platform switch requires it', async () => {
    // Поломка, которую тест обязан ловить: решение «вести на настройку фактора» принимается по
    // одному лишь отсутствию фактора у пользователя, мимо платформенного переключателя. Тогда
    // выключенный в админке второй фактор всё равно уводит персонал на вкладку безопасности,
    // хотя страж страниц уже пускает в кабинет.
    fakes.verifyPassword.mockResolvedValue({ ok: true, userId, emailVerified: true });
    fakes.findUser.mockResolvedValue(user);
    fakes.getSecurityStatus.mockResolvedValue({
      enrolled: false,
      recoveryConfirmed: false,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 1,
    });

    fakes.platformRequiresTwoFactor.mockResolvedValue(false);
    await expect((await login(request())).json()).resolves.toMatchObject({
      ok: true,
      redirectTo: '/app/doctor',
    });

    fakes.platformRequiresTwoFactor.mockResolvedValue(true);
    await expect((await login(request())).json()).resolves.toMatchObject({
      ok: true,
      redirectTo: '/app/account?tab=security',
    });
  });

  it('does not issue a staff session before the required 2FA setting is available', async () => {
    // Authority Ч7: missing/unavailable runtime policy means the login operation is temporarily
    // unavailable. A cookie minted before that decision would complete authentication even though
    // the route itself fails, so the next request could reuse a session from a rejected login.
    fakes.verifyPassword.mockResolvedValue({ ok: true, userId, emailVerified: true });
    fakes.findUser.mockResolvedValue(user);
    fakes.getSecurityStatus.mockResolvedValue({
      enrolled: false,
      recoveryConfirmed: false,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 1,
    });
    fakes.platformRequiresTwoFactor.mockRejectedValue(
      new Error('runtime_setting_unavailable:auth_2fa_enabled'),
    );

    await expect(login(request())).rejects.toThrow(
      'runtime_setting_unavailable:auth_2fa_enabled',
    );
    expect(fakes.setSession).not.toHaveBeenCalled();
  });
});

describe('email/password reset HTTP boundary', () => {
  const challengeId = '00000000-0000-4000-8000-000000000208';
  const request = () =>
    jsonRequest('/api/auth/email-password/reset', {
      email: 'person@example.test',
      challengeId,
      code: '123456',
      newPassword: 'new-password-1074',
    });

  it('uses only the password-reset OTP purpose and keeps unknown/wrong-code failures neutral', async () => {
    fakes.findPasswordUser.mockResolvedValueOnce(null).mockResolvedValueOnce(userId);
    fakes.consumeChallenge.mockResolvedValue({ ok: false, code: 'invalid_code' });

    const unknownAccount = await resetPassword(request());
    const wrongCode = await resetPassword(request());

    expect(unknownAccount.status).toBe(400);
    expect(wrongCode.status).toBe(400);
    await expect(unknownAccount.json()).resolves.toEqual({ ok: false, error: 'invalid_code' });
    await expect(wrongCode.json()).resolves.toEqual({ ok: false, error: 'invalid_code' });
    expect(fakes.consumeChallenge).toHaveBeenNthCalledWith(
      1,
      '00000000-0000-4000-8000-000000000000',
      challengeId,
      '123456',
      'password_reset',
    );
    expect(fakes.consumeChallenge).toHaveBeenNthCalledWith(
      2,
      userId,
      challengeId,
      '123456',
      'password_reset',
    );
    expect(fakes.updatePassword).not.toHaveBeenCalled();
  });

  it('does not report reset success when the session-revocation port fails', async () => {
    fakes.findPasswordUser.mockResolvedValue(userId);
    fakes.consumeChallenge.mockResolvedValue({ ok: true });
    fakes.invalidateSessions.mockRejectedValue(new Error('revocation unavailable'));

    const response = await resetPassword(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'reset_failed' });
    expect(fakes.updatePassword).not.toHaveBeenCalled();
  });
});

describe('password change HTTP boundary', () => {
  const request = () =>
    jsonRequest('/api/account/security/password/change', {
      currentPassword: 'current-password',
      newPassword: 'new-password-1074',
    });

  it('returns the lockout outcome without reissuing a session', async () => {
    fakes.changePassword.mockResolvedValue({
      ok: false,
      error: 'password_temporarily_locked',
      retryAfterSeconds: 321,
      captchaRequired: true,
      captchaRefreshRequired: false,
    });

    const response = await changePassword(request());
    expect(response.status).toBe(429);
    expect(response.headers.get('retry-after')).toBe('321');
    await expect(response.json()).resolves.toMatchObject({
      error: 'password_temporarily_locked',
      retryAfterSeconds: 321,
      captchaRequired: true,
    });
    expect(fakes.setSession).not.toHaveBeenCalled();
  });

  it('reports password-changed partial success when replacement-session issuance fails', async () => {
    fakes.changePassword.mockResolvedValue({ ok: true, user });
    fakes.setSession.mockRejectedValue(new Error('cookie write unavailable'));

    const response = await changePassword(request());

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'password_changed_session_reissue_failed',
      passwordChanged: true,
    });
  });
});
