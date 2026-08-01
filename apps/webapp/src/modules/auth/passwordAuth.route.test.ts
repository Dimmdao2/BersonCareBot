import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { UserPasswordCredentialsPort } from '@/infra/repos/pgUserPasswordCredentials';
import type { PasswordAltchaService } from '@/modules/auth/passwordAltcha';
import type { PasswordChangeService } from '@/modules/auth/passwordChange';
import type { StaffSecurityService } from '@/modules/staff-security/service';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { AppSession, SessionUser } from '@/shared/types/session';

type CheckRateLimit =
  typeof import('@/modules/auth/authConfirmRateLimit').checkAuthConfirmRateLimit;
type ConsumeChallenge = typeof import('@/modules/auth/emailAuth').consumeEmailChallengeCode;
type ConsumeLatest =
  typeof import('@/modules/auth/emailAuth').consumeLatestEmailChallengeCodeForUser;
type HashPin = typeof import('@/modules/auth/pinHash').hashPin;
type IssueStaffLoginContinuation =
  typeof import('@/modules/auth/staffLoginContinuation').issueStaffLoginContinuation;
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
  beginStaffLogin: vi.fn<StaffSecurityService['beginLogin']>(),
  startTotpEnrollment: vi.fn<StaffSecurityService['startTotpEnrollment']>(),
  verifyTotpEnrollment: vi.fn<StaffSecurityService['verifyTotpEnrollment']>(),
  confirmRecoveryCodes: vi.fn<StaffSecurityService['confirmRecoveryCodes']>(),
  revokeStaffSessions: vi.fn<StaffSecurityService['revokeSessions']>(),
  changePassword: vi.fn<PasswordChangeService['changePassword']>(),
  consumeChallenge: vi.fn<ConsumeChallenge>(),
  consumeLatest: vi.fn<ConsumeLatest>(),
  hashPassword: vi.fn<HashPin>(),
  issueStaffLoginContinuation: vi.fn<IssueStaffLoginContinuation>(),
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
vi.mock('@/modules/auth/staffLoginContinuation', () => ({
  issueStaffLoginContinuation: fakes.issueStaffLoginContinuation,
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
      beginLogin: fakes.beginStaffLogin,
      startTotpEnrollment: fakes.startTotpEnrollment,
      verifyTotpEnrollment: fakes.verifyTotpEnrollment,
      confirmRecoveryCodes: fakes.confirmRecoveryCodes,
      revokeSessions: fakes.revokeStaffSessions,
    },
    passwordChange: { changePassword: fakes.changePassword },
  }),
}));

import { POST as login } from '@/app/api/auth/email-password/login/route';
import { POST as resetPassword } from '@/app/api/auth/email-password/reset/route';
import { POST as changePassword } from '@/app/api/account/security/password/change/route';
import { GET as getSecurityStatus } from '@/app/api/account/security/status/route';
import { POST as startTotp } from '@/app/api/account/security/totp/start/route';
import { POST as verifyTotp } from '@/app/api/account/security/totp/verify/route';
import { POST as confirmRecovery } from '@/app/api/account/security/recovery/confirm/route';

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
  fakes.beginStaffLogin.mockResolvedValue({
    required: true,
    token: 'factor-challenge-token',
    expiresAt: '2026-08-01T21:00:00.000Z',
    replacementRequired: false,
  });
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

  it('sends staff without a self-enrolled factor to their cabinet', async () => {
    fakes.verifyPassword.mockResolvedValue({ ok: true, userId, emailVerified: true });
    fakes.findUser.mockResolvedValue(user);
    fakes.getSecurityStatus.mockResolvedValue({
      enrolled: false,
      recoveryConfirmed: false,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 1,
    });

    await expect((await login(request())).json()).resolves.toMatchObject({
      ok: true,
      redirectTo: '/app/doctor',
    });
    expect(fakes.setSession).toHaveBeenCalledOnce();
  });

  it('requires the already-enrolled staff factor before issuing a session', async () => {
    fakes.verifyPassword.mockResolvedValue({ ok: true, userId, emailVerified: true });
    fakes.findUser.mockResolvedValue({ ...user, securityFactorRequired: true });
    fakes.getSecurityStatus.mockResolvedValue({
      enrolled: true,
      recoveryConfirmed: true,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 1,
    });

    await expect((await login(request())).json()).resolves.toEqual({
      ok: true,
      factorRequired: true,
    });
    expect(fakes.setSession).not.toHaveBeenCalled();
  });
});

describe('voluntary staff TOTP and recovery HTTP boundaries', () => {
  it('keeps status, enrollment, verification and recovery confirmation reachable', async () => {
    fakes.getSecurityStatus.mockResolvedValue({
      enrolled: false,
      recoveryConfirmed: false,
      replacementRequired: false,
      lockedUntil: null,
      sessionVersion: 1,
    });
    fakes.startTotpEnrollment.mockResolvedValue({
      ok: true,
      secret: 'test-secret',
      uri: 'otpauth://totp/BersonCare:test',
    });
    fakes.verifyTotpEnrollment.mockResolvedValue({
      ok: true,
      recoveryCodes: ['recovery-code'],
      sessionVersion: 2,
    });
    fakes.confirmRecoveryCodes.mockResolvedValue(true);
    fakes.findUser.mockResolvedValue(user);

    await expect((await getSecurityStatus()).json()).resolves.toMatchObject({
      ok: true,
      status: { enrolled: false },
    });
    await expect((await startTotp()).json()).resolves.toMatchObject({ ok: true });
    await expect(
      (
        await verifyTotp(jsonRequest('/api/account/security/totp/verify', { code: '123456' }))
      ).json(),
    ).resolves.toEqual({ ok: true, recoveryCodes: ['recovery-code'] });

    fakes.requireStaffSession.mockResolvedValue({
      ok: true,
      session: {
        ...session,
        staffSecurity: { assurance: 'recovery_confirmation', verifiedAt: 1_790_000_000 },
      },
    });
    await expect((await confirmRecovery()).json()).resolves.toEqual({ ok: true });
    expect(fakes.setSession).toHaveBeenLastCalledWith(user, {
      staffSecurity: expect.objectContaining({ assurance: 'factor_verified' }),
    });
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
