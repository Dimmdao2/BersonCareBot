import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PhoneChallengePayload } from '@/modules/auth/phoneChallengeStore';
import type { StartPhoneAuthOptions, StartPhoneAuthResult } from '@/modules/auth/phoneAuth';
import type { AppSession, SessionUser } from '@/shared/types/session';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001111';
const BRANDED_ORGANIZATION_ID = '00000000-0000-4000-8000-000000002222';

type StartPhoneAuth = (
  phone: string,
  context: { channel: 'web'; chatId: string; displayName?: string },
  options?: StartPhoneAuthOptions,
) => Promise<StartPhoneAuthResult>;

const fakes = vi.hoisted(() => ({
  findByPhone: vi.fn<(phone: string) => Promise<SessionUser | null>>(),
  findByUserId: vi.fn<(userId: string) => Promise<SessionUser | null>>(),
  startPhoneAuth: vi.fn<StartPhoneAuth>(),
  getCurrentSession: vi.fn<() => Promise<AppSession | null>>(),
  getCurrentOrganizationId: vi.fn<() => string | undefined>(),
  isChannelEnabled: vi.fn<(channel: string) => Promise<boolean>>(),
  getPhoneChallenge: vi.fn<(challengeId: string) => Promise<PhoneChallengePayload | null>>(),
  confirmPhoneAuth: vi.fn(),
  enqueueMergeNotification: vi.fn(),
  syncCalendarTimezone: vi.fn(),
  checkConfirmRateLimit: vi.fn<() => Promise<{ limited: false }>>(),
  surface: {
    current: 'patient_default' as
      | 'patient_default'
      | 'patient_branded'
      | 'staff'
      | 'platform_admin',
    availableMethods: ['phone_bot'] as string[],
    brandedOrganizationId: '00000000-0000-4000-8000-000000002222',
  },
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  recordAuthRegistrationFailure: vi.fn(),
  recordAuthRegistrationSuccess: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({ getCurrentSession: fakes.getCurrentSession }));
vi.mock('@bersoncare/db-principal', () => ({
  getCurrentDbPrincipalOrganizationId: fakes.getCurrentOrganizationId,
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 600,
  checkAuthConfirmRateLimit: fakes.checkConfirmRateLimit,
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/verifiedStaffPrimaryLogin', () => ({
  prepareVerifiedPrimaryLogin: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn().mockReturnValue(false),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isAuthChannelEnabled: fakes.isChannelEnabled,
}));
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  requireResolvedSurface: () =>
    fakes.surface.current === 'patient_branded'
      ? {
          surface: 'patient_branded',
          publicOrigin: 'https://clinic.example.test',
          organizationId: fakes.surface.brandedOrganizationId,
          clinicSlug: 'clinic',
          authPolicy: {
            availableMethods: fakes.surface.availableMethods,
            enabledMethods: fakes.surface.availableMethods,
          },
        }
      : {
          surface: fakes.surface.current,
          publicOrigin: 'https://app.example.test',
          authPolicy: {
            availableMethods: fakes.surface.availableMethods,
            enabledMethods: fakes.surface.availableMethods,
          },
        },
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    userByPhone: {
      findByPhone: fakes.findByPhone,
      findByUserId: fakes.findByUserId,
    },
    auth: {
      startPhoneAuth: fakes.startPhoneAuth,
      getPhoneChallenge: fakes.getPhoneChallenge,
      confirmPhoneAuth: fakes.confirmPhoneAuth,
    },
    accountMergeNotifications: {
      enqueue: fakes.enqueueMergeNotification,
    },
    patientCalendarTimezone: {
      syncFromDevice: fakes.syncCalendarTimezone,
    },
  }),
}));

import { POST as startPhone } from '@/app/api/auth/phone/start/route';
import { POST as confirmPhone } from '@/app/api/auth/phone/confirm/route';

const patient: SessionUser = {
  userId: '00000000-0000-4000-8000-000000001005',
  role: 'client',
  displayName: 'Profile bind patient',
  bindings: { telegramId: 'tg-1005' },
  sessionEpoch: 1,
};

const patientSession: AppSession = {
  user: patient,
  issuedAt: 1_700_000_000,
  expiresAt: 1_800_000_000,
};

function startRequest(body: object): Request {
  return new Request('https://app.example.test/api/auth/phone/start', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

function confirmRequest(body: object): Request {
  return new Request('https://app.example.test/api/auth/phone/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.surface.current = 'patient_default';
  fakes.surface.availableMethods = ['phone_bot'];
  fakes.isChannelEnabled.mockResolvedValue(true);
  fakes.getCurrentSession.mockResolvedValue(patientSession);
  fakes.getCurrentOrganizationId.mockReturnValue(ORGANIZATION_ID);
  fakes.findByPhone.mockResolvedValue(patient);
  fakes.findByUserId.mockResolvedValue(patient);
  fakes.startPhoneAuth.mockResolvedValue({
    ok: true,
    challengeId: 'profile-bind-challenge',
    retryAfterSeconds: 60,
  });
  fakes.getPhoneChallenge.mockResolvedValue(null);
  fakes.confirmPhoneAuth.mockResolvedValue({
    ok: true,
    mergeRequired: false,
    user: patient,
    redirectTo: '/app/patient',
    deliveryChannel: 'telegram',
    wasCreated: false,
  });
  fakes.checkConfirmRateLimit.mockResolvedValue({ limited: false });
});

describe('direct phone OTP boundary', () => {
  it('rejects a surface without phone_bot before parsing or identity lookup', async () => {
    fakes.surface.current = 'staff';
    fakes.surface.availableMethods = ['password'];

    const response = await startPhone(startRequest({}));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'auth_method_disabled',
    });
    expect(fakes.isChannelEnabled).not.toHaveBeenCalled();
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('rejects login through phone/start even when the caller selects a delivery channel', async () => {
    const response = await startPhone(
      startRequest({
        phone: '+79991234567',
        purpose: 'login',
        deliveryChannel: 'telegram',
      }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'direct_phone_login_disabled',
    });
    expect(fakes.isChannelEnabled).not.toHaveBeenCalled();
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('treats an omitted purpose as login and rejects it before identity lookup', async () => {
    const response = await startPhone(
      startRequest({ phone: '+79991234567', deliveryChannel: 'telegram' }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({
      ok: false,
      error: 'direct_phone_login_disabled',
    });
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it.each([
    {
      surface: 'staff' as const,
      availableMethods: ['password'],
      body: { phone: '+79991234567', purpose: 'profile_bind', deliveryChannel: 'telegram' },
      error: 'auth_method_disabled',
    },
    {
      surface: 'platform_admin' as const,
      availableMethods: ['password'],
      body: { phone: '+79991234567', purpose: 'profile_bind', deliveryChannel: 'telegram' },
      error: 'auth_method_disabled',
    },
    {
      surface: 'patient_branded' as const,
      availableMethods: ['phone_bot'],
      body: { phone: '+79991234567', purpose: 'login', deliveryChannel: 'telegram' },
      error: 'direct_phone_login_disabled',
    },
    {
      surface: 'patient_branded' as const,
      availableMethods: ['phone_bot'],
      body: { phone: '+79991234567', deliveryChannel: 'telegram' },
      error: 'direct_phone_login_disabled',
    },
  ])('keeps the $surface rejection before identity lookup', async ({
    surface,
    availableMethods,
    body,
    error,
  }) => {
    fakes.surface.current = surface;
    fakes.surface.availableMethods = availableMethods;

    const response = await startPhone(startRequest(body));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({ ok: false, error });
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('rejects an unauthenticated profile bind before identity lookup', async () => {
    fakes.getCurrentSession.mockResolvedValue(null);

    const response = await startPhone(
      startRequest({
        phone: '+79991234567',
        purpose: 'profile_bind',
        deliveryChannel: 'telegram',
      }),
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ ok: false, error: 'unauthorized' });
    expect(fakes.findByPhone).not.toHaveBeenCalled();
    expect(fakes.startPhoneAuth).not.toHaveBeenCalled();
  });

  it('keeps authenticated profile binding through phone/start alive', async () => {
    const response = await startPhone(
      startRequest({
        phone: '+79991234567',
        purpose: 'profile_bind',
        deliveryChannel: 'telegram',
      }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      challengeId: 'profile-bind-challenge',
      retryAfterSeconds: 60,
      deliveryChannel: 'telegram',
    });
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      expect.objectContaining({ channel: 'web' }),
      {
        delivery: { channel: 'telegram', recipientId: 'tg-1005' },
        profileBindUserId: patient.userId,
        profileBindOrganizationId: ORGANIZATION_ID,
      },
    );
  });

  it('keeps the branded clinic sender scope for direct profile binding', async () => {
    fakes.surface.current = 'patient_branded';

    const response = await startPhone(
      startRequest({
        phone: '+79991234567',
        purpose: 'profile_bind',
        deliveryChannel: 'telegram',
      }),
    );

    expect(response.status).toBe(200);
    expect(fakes.startPhoneAuth).toHaveBeenCalledWith(
      '+79991234567',
      expect.objectContaining({ channel: 'web' }),
      expect.objectContaining({
        delivery: {
          channel: 'telegram',
          recipientId: 'tg-1005',
          clinicRequiredOrganizationId: BRANDED_ORGANIZATION_ID,
        },
      }),
    );
  });

  it('rejects phone/confirm challenges that were not issued for profile binding', async () => {
    fakes.getPhoneChallenge.mockResolvedValue({
      phone: '+79991234567',
      expiresAt: 1_800_000_000,
      deliveryChannel: 'telegram',
    });

    const response = await confirmPhone(
      confirmRequest({ challengeId: 'legacy-login-challenge', code: '123456' }),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      error: 'direct_phone_login_disabled',
    });
    expect(fakes.confirmPhoneAuth).not.toHaveBeenCalled();
  });

  it('keeps profile binding confirmation available for a profile-bind challenge', async () => {
    fakes.getPhoneChallenge.mockResolvedValue({
      phone: '+79991234567',
      expiresAt: 1_800_000_000,
      deliveryChannel: 'telegram',
      profileBindUserId: patient.userId,
      profileBindOrganizationId: ORGANIZATION_ID,
    });

    const response = await confirmPhone(
      confirmRequest({ challengeId: 'profile-bind-challenge', code: '123456' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      redirectTo: '/app/patient',
      role: 'client',
    });
  });
});
