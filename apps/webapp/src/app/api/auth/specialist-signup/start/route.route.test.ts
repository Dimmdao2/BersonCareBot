import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildAppDeps: vi.fn(),
  hashPin: vi.fn(),
  isAuthChannelEnabled: vi.fn(),
  getSpecialistSignupEnabled: vi.fn(),
  registerPendingSpecialistVerification: vi.fn(),
  startEmailChallenge: vi.fn(),
  createSpecialistSignupIntent: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/modules/auth/pinHash', () => ({ hashPin: fakes.hashPin }));
vi.mock('@/modules/auth/specialistSignupRollout', () => ({
  getSpecialistSignupEnabled: fakes.getSpecialistSignupEnabled,
}));
vi.mock('@/modules/auth/emailAuth', () => ({
  normalizeEmail: (email: string) => email.trim().toLowerCase(),
  startEmailChallenge: fakes.startEmailChallenge,
}));

import { POST } from './route';

const body = {
  email: 'doctor@example.test',
  password: 'password-123',
  lastName: 'Иванов',
  firstName: 'Иван',
  organizationSlug: 'clinic-name',
};

function request(organizationTitle: string): Request {
  return new Request('https://therapysto.test/api/auth/specialist-signup/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ ...body, organizationTitle }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isAuthChannelEnabled.mockResolvedValue(true);
  fakes.getSpecialistSignupEnabled.mockResolvedValue(true);
  fakes.hashPin.mockResolvedValue('password-hash');
  fakes.registerPendingSpecialistVerification.mockResolvedValue({ ok: true, userId: 'user-1' });
  fakes.startEmailChallenge.mockResolvedValue({
    ok: true,
    challengeId: '00000000-0000-4000-8000-000000000001',
    retryAfterSeconds: 60,
  });
  fakes.createSpecialistSignupIntent.mockResolvedValue(undefined);
  fakes.buildAppDeps.mockReturnValue({
    userPasswordCredentials: {
      registerPendingSpecialistVerification: fakes.registerPendingSpecialistVerification,
      deleteUnverifiedEmailPasswordRegistration: vi.fn(),
    },
    organizationProvisioning: {
      createSpecialistSignupIntent: fakes.createSpecialistSignupIntent,
    },
  });
});

describe('POST /api/auth/specialist-signup/start organization title', () => {
  it('accepts exactly 100 characters without changing the title', async () => {
    const organizationTitle = 'К'.repeat(100);

    const response = await POST(request(organizationTitle));

    expect(response.status).toBe(200);
    expect(fakes.createSpecialistSignupIntent).toHaveBeenCalledWith(
      expect.objectContaining({ organizationTitle }),
    );
  });

  it('returns a typed, human-readable error for 101 characters', async () => {
    const response = await POST(request('К'.repeat(101)));

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'organization_name_too_long',
      message: 'Название клиники не должно быть длиннее 100 знаков.',
    });
    expect(fakes.createSpecialistSignupIntent).not.toHaveBeenCalled();
  });
});
