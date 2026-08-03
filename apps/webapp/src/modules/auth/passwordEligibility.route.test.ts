import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { EmailPasswordLookupPort } from '@/modules/auth/emailPasswordLookup/ports';
import type { UserPasswordCredentialsPort } from '@/infra/repos/pgUserPasswordCredentials';
import type { UserByPhonePort } from '@/modules/auth/userByPhonePort';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  registerPendingVerification: vi.fn<UserPasswordCredentialsPort['registerPendingVerification']>(),
  resolveAuthState: vi.fn<EmailPasswordLookupPort['resolveAuthState']>(),
  confirmEmailChallenge: vi.fn(),
  consumeLatest: vi.fn(),
  findUser: vi.fn<UserByPhonePort['findByUserId']>(),
  updateRole: vi.fn(),
  setSession: vi.fn(),
  upsertPasswordHash: vi.fn<UserPasswordCredentialsPort['upsertPasswordHash']>(),
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
  startEmailChallenge: vi.fn(),
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
      registerPendingVerification: fakes.registerPendingVerification,
      upsertPasswordHash: fakes.upsertPasswordHash,
    },
    emailPasswordLookup: { resolveAuthState: fakes.resolveAuthState },
    userByPhone: { findByUserId: fakes.findUser },
    userProjection: { updateRole: fakes.updateRole },
  }),
}));

import { POST as register } from '@/app/api/auth/email-password/register/route';
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
});

describe('email/password register HTTP boundary', () => {
  const request = () =>
    jsonRequest('/api/auth/email-password/register', {
      email: 'patient@example.test',
      password: 'a-strong-password',
      lastName: 'Иванов',
      firstName: 'Иван',
    });

  it('blocks self-registration with a password before touching the DB (register only ever creates patient accounts)', async () => {
    const response = await register(request());

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'password_not_available_for_role',
    });
    expect(fakes.registerPendingVerification).not.toHaveBeenCalled();
  });
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
