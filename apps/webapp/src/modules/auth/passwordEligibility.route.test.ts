import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailPasswordLookupPort } from '@/modules/auth/emailPasswordLookup/ports';
import type { UserPasswordCredentialsPort } from '@/infra/repos/pgUserPasswordCredentials';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  resolveAuthState: vi.fn<EmailPasswordLookupPort['resolveAuthState']>(),
  startEmailChallenge: vi.fn(),
  confirmEmailChallenge: vi.fn(),
  consumeLatest: vi.fn(),
  findUser: vi.fn<UserByPhonePort['findByUserId']>(),
  invalidateSessions: vi.fn<UserByPhonePort['invalidateSessionsForSelf']>(),
  updateRole: vi.fn(),
  setSession: vi.fn(),
  upsertPasswordHash: vi.fn<UserPasswordCredentialsPort['upsertPasswordHash']>(),
  updatePasswordHash: vi.fn<UserPasswordCredentialsPort['updatePasswordHash']>(),
  getSecurityStatus: vi.fn(),
  revokeStaffSessions: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({ ensureAuthModulePortsBound: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: vi.fn().mockResolvedValue(true),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: vi.fn().mockResolvedValue({ limited: false }),
}));
vi.mock('@/modules/auth/emailAuth', () => ({
  normalizeEmail: (value: string) => value.trim().toLowerCase(),
  startEmailChallenge: fakes.startEmailChallenge,
  confirmEmailChallenge: fakes.confirmEmailChallenge,
  consumeLatestEmailChallengeCodeForUser: fakes.consumeLatest,
}));
vi.mock('@/modules/auth/pinHash', () => ({ hashPin: vi.fn().mockResolvedValue('hashed') }));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: fakes.setSession }));
vi.mock('@/modules/auth/envRole', () => ({
  resolveRoleFromEnv: vi.fn().mockResolvedValue('client'),
  reconcileDbRoleWithEnvRole: (dbRole: string) => dbRole,
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn(() => true),
}));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: vi.fn(() => 'attempt-id'),
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  recordAuthRegistrationSuccess: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userPasswordCredentials: {
      upsertPasswordHash: fakes.upsertPasswordHash,
      updatePasswordHash: fakes.updatePasswordHash,
    },
    emailPasswordLookup: { resolveAuthState: fakes.resolveAuthState },
    userByPhone: {
      findByUserId: fakes.findUser,
      invalidateSessionsForSelf: fakes.invalidateSessions,
    },
    userProjection: { updateRole: fakes.updateRole },
    staffSecurity: {
      getStatus: fakes.getSecurityStatus,
      revokeSessions: fakes.revokeStaffSessions,
    },
  }),
}));

import { POST as forgotPassword } from '@/app/api/auth/email-password/forgot/route';
import { POST as resetPassword } from '@/app/api/auth/email-password/reset/route';
import { POST as requestSetupAccess } from '@/app/api/auth/email-password/setup-access/route';
import { POST as setupCodeComplete } from '@/app/api/auth/email-password/setup-code/complete/route';

const userId = '00000000-0000-4000-8000-000000000301';
const doctorUser: SessionUser = {
  userId,
  role: 'doctor',
  displayName: 'Staff account',
  bindings: {},
  sessionEpoch: 1,
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
  fakes.getSecurityStatus.mockResolvedValue(null);
  fakes.invalidateSessions.mockResolvedValue(undefined);
  fakes.revokeStaffSessions.mockResolvedValue(undefined);
});

describe('email/password setup-code complete HTTP boundary', () => {
  const request = () =>
    jsonRequest('/api/auth/email-password/setup-code/complete', {
      email: 'person@example.test',
      challengeId: '00000000-0000-4000-8000-000000000302',
      code: '123456',
      password: 'a-strong-password',
    });

  it('blocks setting a password for a patient account created without one', async () => {
    fakes.resolveAuthState.mockResolvedValue({ kind: 'needs_email_setup', userId });
    fakes.confirmEmailChallenge.mockResolvedValue({ ok: true });
    fakes.findUser.mockResolvedValue({ ...doctorUser, role: 'client' });

    const response = await setupCodeComplete(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'password_not_available_for_role',
    });
    expect(fakes.upsertPasswordHash).not.toHaveBeenCalled();
    expect(fakes.setSession).not.toHaveBeenCalled();
  });

  it('allows a staff account (created without a password) to complete setup', async () => {
    fakes.resolveAuthState.mockResolvedValue({ kind: 'needs_email_setup', userId });
    fakes.confirmEmailChallenge.mockResolvedValue({ ok: true });
    fakes.findUser.mockResolvedValue(doctorUser);

    const response = await setupCodeComplete(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, role: 'doctor' });
    expect(fakes.upsertPasswordHash).toHaveBeenCalledOnce();
  });
});

describe('password recovery doors before code verification', () => {
  const accountStates = [
    { email: 'unknown@example.test', state: { kind: 'free' as const } },
    {
      email: 'contact-only@example.test',
      state: { kind: 'needs_email_setup' as const, userId },
    },
    {
      email: 'password@example.test',
      state: { kind: 'verified_with_password' as const, userId },
    },
    {
      email: 'owner-patient@example.test',
      state: {
        kind: 'verified_with_password' as const,
        userId: '00000000-0000-4000-8000-000000000304',
      },
    },
  ];

  const publicFingerprint = async (response: Response) => ({
    status: response.status,
    body: await response.json(),
    contentType: response.headers.get('content-type'),
    location: response.headers.get('location'),
    retryAfter: response.headers.get('retry-after'),
    redirected: response.redirected,
  });

  it('returns one public HTTP fingerprint per door for unknown, contact-only, password, and owner-patient addresses, including repeats', async () => {
    fakes.resolveAuthState.mockImplementation(async (email) => {
      const account = accountStates.find((candidate) => candidate.email === email);
      if (!account) throw new Error(`unexpected email: ${email}`);
      return account.state;
    });
    fakes.findUser.mockResolvedValue(doctorUser);
    fakes.startEmailChallenge.mockResolvedValue({
      ok: true,
      challengeId: '00000000-0000-4000-8000-000000000305',
      retryAfterSeconds: 60,
    });
    fakes.confirmEmailChallenge.mockResolvedValue({ ok: false, code: 'invalid_code' });

    const forgotFingerprints = [];
    const setupAccessFingerprints = [];
    const setupCompleteFingerprints = [];
    for (let attempt = 0; attempt < 2; attempt += 1) {
      forgotFingerprints.push(
        ...(await Promise.all(
          accountStates.map(({ email }) =>
            forgotPassword(jsonRequest('/api/auth/email-password/forgot', { email })).then(
              publicFingerprint,
            ),
          ),
        )),
      );
      setupAccessFingerprints.push(
        ...(await Promise.all(
          accountStates.map(({ email }) =>
            requestSetupAccess(
              jsonRequest('/api/auth/email-password/setup-access', { email }),
            ).then(publicFingerprint),
          ),
        )),
      );
      setupCompleteFingerprints.push(
        ...(await Promise.all(
          accountStates.map(({ email }) =>
            setupCodeComplete(
              jsonRequest('/api/auth/email-password/setup-code/complete', {
                email,
                challengeId: '00000000-0000-4000-8000-000000000306',
                code: '000000',
                password: 'a-strong-password',
              }),
            ).then(publicFingerprint),
          ),
        )),
      );
    }

    const accepted = {
      status: 200,
      body: { ok: true, retryAfterSeconds: 60 },
      contentType: 'application/json',
      location: null,
      retryAfter: null,
      redirected: false,
    };
    const invalidCode = {
      status: 400,
      body: { ok: false, error: 'invalid_code' },
      contentType: 'application/json',
      location: null,
      retryAfter: null,
      redirected: false,
    };
    expect(forgotFingerprints).toEqual(accountStates.flatMap(() => [accepted, accepted]));
    expect(setupAccessFingerprints).toEqual(accountStates.flatMap(() => [accepted, accepted]));
    expect(setupCompleteFingerprints).toEqual(
      accountStates.flatMap(() => [invalidCode, invalidCode]),
    );
  });

  it('does not wait on candidate-only delivery work or timers before returning the neutral pre-code response', async () => {
    vi.useFakeTimers();
    try {
      fakes.resolveAuthState.mockResolvedValue({ kind: 'needs_email_setup', userId });
      fakes.findUser.mockReturnValue(new Promise(() => undefined));

      const forgotStatus = forgotPassword(
        jsonRequest('/api/auth/email-password/forgot', { email: 'contact-only@example.test' }),
      ).then((response) => response.status);
      const setupAccessStatus = requestSetupAccess(
        jsonRequest('/api/auth/email-password/setup-access', {
          email: 'contact-only@example.test',
        }),
      ).then((response) => response.status);

      await vi.advanceTimersByTimeAsync(0);

      await expect(Promise.race([forgotStatus, Promise.resolve('not settled')])).resolves.toBe(200);
      await expect(Promise.race([setupAccessStatus, Promise.resolve('not settled')])).resolves.toBe(
        200,
      );
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('password recovery doors after code verification', () => {
  it('keeps setup-code completion behind code verification and only sets a password for a setup-eligible account', async () => {
    fakes.confirmEmailChallenge.mockResolvedValue({ ok: true });
    fakes.findUser.mockResolvedValue(doctorUser);
    const states = [
      {
        state: { kind: 'free' as const },
        expected: { status: 400, body: { ok: false, error: 'invalid_code' } },
      },
      {
        state: { kind: 'verified_with_password' as const, userId },
        expected: { status: 400, body: { ok: false, error: 'invalid_code' } },
      },
      {
        state: { kind: 'needs_email_setup' as const, userId },
        expected: { status: 200, body: { ok: true, redirectTo: '/app/doctor', role: 'doctor' } },
      },
    ];

    for (const { state, expected } of states) {
      vi.clearAllMocks();
      fakes.confirmEmailChallenge.mockResolvedValue({ ok: true });
      fakes.findUser.mockResolvedValue(doctorUser);
      fakes.resolveAuthState.mockResolvedValue(state);
      const response = await setupCodeComplete(
        jsonRequest('/api/auth/email-password/setup-code/complete', {
          email: 'person@example.test',
          challengeId: '00000000-0000-4000-8000-000000000302',
          code: '123456',
          password: 'a-strong-password',
        }),
      );

      expect(response.status).toBe(expected.status);
      await expect(response.json()).resolves.toEqual(expected.body);
    }
  });

  it('does not bypass one-time-code consumption on password reset or first-time setup', async () => {
    fakes.resolveAuthState.mockResolvedValue({ kind: 'verified_with_password', userId });
    fakes.consumeLatest
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: 'expired_code' });
    fakes.findUser.mockResolvedValue(doctorUser);

    const firstReset = await resetPassword(
      jsonRequest('/api/auth/email-password/reset', {
        email: 'person@example.test',
        code: '123456',
        newPassword: 'a-strong-password',
      }),
    );
    const reusedReset = await resetPassword(
      jsonRequest('/api/auth/email-password/reset', {
        email: 'person@example.test',
        code: '123456',
        newPassword: 'a-strong-password',
      }),
    );

    expect(firstReset.status).toBe(200);
    await expect(firstReset.json()).resolves.toEqual({ ok: true });
    expect(reusedReset.status).toBe(400);
    await expect(reusedReset.json()).resolves.toEqual({ ok: false, error: 'invalid_code' });
    expect(fakes.updatePasswordHash).toHaveBeenCalledOnce();

    vi.clearAllMocks();
    fakes.resolveAuthState.mockResolvedValue({ kind: 'needs_email_setup', userId });
    fakes.confirmEmailChallenge
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({ ok: false, code: 'expired_code' });
    fakes.findUser.mockResolvedValue(doctorUser);

    const firstSetup = await setupCodeComplete(
      jsonRequest('/api/auth/email-password/setup-code/complete', {
        email: 'person@example.test',
        challengeId: '00000000-0000-4000-8000-000000000302',
        code: '123456',
        password: 'a-strong-password',
      }),
    );
    const reusedSetup = await setupCodeComplete(
      jsonRequest('/api/auth/email-password/setup-code/complete', {
        email: 'person@example.test',
        challengeId: '00000000-0000-4000-8000-000000000302',
        code: '123456',
        password: 'a-strong-password',
      }),
    );

    expect(firstSetup.status).toBe(200);
    await expect(firstSetup.json()).resolves.toEqual({
      ok: true,
      redirectTo: '/app/doctor',
      role: 'doctor',
    });
    expect(reusedSetup.status).toBe(400);
    await expect(reusedSetup.json()).resolves.toEqual({ ok: false, error: 'invalid_code' });
    expect(fakes.upsertPasswordHash).toHaveBeenCalledOnce();
  });
});
