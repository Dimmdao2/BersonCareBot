import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SessionUser } from '@/shared/types/session';

const fakes = vi.hoisted(() => ({
  cookieValues: new Map<string, string>(),
  cookieWrites: [] as string[],
  buildAppDeps: vi.fn(),
  checkAuthConfirmRateLimit: vi.fn(),
  confirmEmailChallenge: vi.fn(),
  getSpecialistSignupEnabled: vi.fn(),
  isAuthChannelEnabled: vi.fn(),
  provisionSpecialistOwner: vi.fn(),
  recordIdentitySessionStart: vi.fn(),
  recordUserLoginEvent: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const value = fakes.cookieValues.get(name);
      return value === undefined ? undefined : { name, value };
    },
    set: (name: string, value: string) => {
      fakes.cookieValues.set(name, value);
      fakes.cookieWrites.push(name);
    },
  }),
  headers: async () => new Headers({ host: 'therapysto.example.test' }),
}));
vi.mock('@/config/env', () => ({
  env: {
    NODE_ENV: 'test',
    ALLOW_DEV_AUTH_BYPASS: false,
    SESSION_COOKIE_SECRET: 'specialist-signup-session-test-secret',
    APP_BASE_URL: 'https://therapysto.example.test',
    PATIENT_APP_ORIGIN: 'https://therapysto.example.test',
    PATIENT_APP_NAME: 'TherapyGo',
  },
  isProduction: false,
  webappRuntimeDatabaseIsConfigured: () => true,
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/principal/sessionPrincipal', () => ({
  stampDbPrincipalFromSession: vi.fn(),
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
  runWithStaffSecuritySelfPrincipal: async (
    _userId: string,
    _source: string,
    fn: () => unknown,
  ) => fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: fakes.buildAppDeps }));
vi.mock('@/modules/auth/authConfirmRateLimit', () => ({
  AUTH_CONFIRM_RATE_LIMIT_SEC: 60,
  checkAuthConfirmRateLimit: fakes.checkAuthConfirmRateLimit,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  AUTH_CHANNEL_DISABLED_ERROR: 'auth_channel_disabled',
  isAuthChannelEnabled: fakes.isAuthChannelEnabled,
}));
vi.mock('@/modules/auth/emailAuth', () => ({
  confirmEmailChallenge: fakes.confirmEmailChallenge,
  isVerifiedEmailGlobalAdminAsync: vi.fn(async () => false),
}));
vi.mock('@/modules/auth/specialistSignupRollout', () => ({
  getSpecialistSignupEnabled: fakes.getSpecialistSignupEnabled,
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getIntegratorWebappEntrySecret: vi.fn(),
  getMaxBotApiKey: vi.fn(),
  getTelegramBotToken: vi.fn(),
  getTelegramLoginWidgetBotToken: vi.fn(),
}));
vi.mock('@/app-layer/identity/recordIdentityBoundaryCrossing', () => ({
  recordIdentitySessionStart: fakes.recordIdentitySessionStart,
}));
vi.mock('@/app-layer/identity/recordUserLoginEvent', () => ({
  recordUserLoginEvent: fakes.recordUserLoginEvent,
}));
vi.mock('@bersoncare/db-principal', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  ensureCorrelationId: vi.fn(),
  ensureDbPrincipalContext: vi.fn(),
}));

import { POST } from './route';
import { decodeSessionCookie } from '@/modules/auth/sessionCookie';
import {
  DEVICE_MARKER_COOKIE_NAME,
  FRESH_LOGIN_COOKIE_NAME,
  SESSION_COOKIE_NAME,
} from '@/modules/auth/sessionCookieNames';

const challengeId = '00000000-0000-4000-8000-000000000001';
const userId = '00000000-0000-4000-8000-000000000101';
const organizationId = '00000000-0000-4000-8000-000000000201';

const beforeProvisioning: SessionUser = {
  userId,
  role: 'client',
  displayName: 'Иван Иванов',
  bindings: {},
  sessionEpoch: 7,
};
const afterProvisioning: SessionUser = {
  ...beforeProvisioning,
  role: 'doctor',
};

function request(): Request {
  return new Request('https://therapysto.example.test/api/auth/specialist-signup/confirm', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ challengeId, code: '123456' }),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.cookieValues.clear();
  fakes.cookieWrites.length = 0;
  fakes.checkAuthConfirmRateLimit.mockResolvedValue({ limited: false });
  fakes.isAuthChannelEnabled.mockResolvedValue(true);
  fakes.getSpecialistSignupEnabled.mockResolvedValue(true);
  fakes.confirmEmailChallenge.mockResolvedValue({ ok: true });
  fakes.provisionSpecialistOwner.mockResolvedValue({
    organizationId,
    specialistId: '00000000-0000-4000-8000-000000000202',
    membershipId: '00000000-0000-4000-8000-000000000203',
  });
  fakes.recordIdentitySessionStart.mockResolvedValue(undefined);
  fakes.recordUserLoginEvent.mockResolvedValue({
    eventId: '00000000-0000-4000-8000-000000000301',
    deviceWasNew: true,
    firstLoginEver: true,
    country: null,
  });

  const findByUserId = vi
    .fn()
    .mockResolvedValueOnce(beforeProvisioning)
    .mockResolvedValueOnce(afterProvisioning);
  fakes.buildAppDeps.mockReturnValue({
    userPasswordCredentials: {
      findUserIdByEmailChallengeId: vi.fn().mockResolvedValue(userId),
    },
    organizationProvisioning: {
      getSpecialistSignupIntentByChallengeId: vi.fn().mockResolvedValue({
        userId,
        organizationSlug: 'clinic',
      }),
      provisionSpecialistOwner: fakes.provisionSpecialistOwner,
    },
    staffSecurity: { ensureProfile: vi.fn().mockResolvedValue(undefined) },
    userByPhone: { findByUserId },
  });
});

describe('POST /api/auth/specialist-signup/confirm', () => {
  it('keeps one login birth while refreshing the provisioned doctor session', async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ ok: true, organizationId });
    expect(fakes.recordIdentitySessionStart).toHaveBeenCalledOnce();
    expect(fakes.recordUserLoginEvent).toHaveBeenCalledOnce();
    expect(fakes.cookieWrites.filter((name) => name === FRESH_LOGIN_COOKIE_NAME)).toHaveLength(1);
    expect(fakes.cookieWrites.filter((name) => name === DEVICE_MARKER_COOKIE_NAME)).toHaveLength(1);

    const encodedSession = fakes.cookieValues.get(SESSION_COOKIE_NAME);
    expect(encodedSession).toBeDefined();
    const session = decodeSessionCookie(encodedSession ?? '');
    expect(session).toMatchObject({
      user: { userId, role: 'doctor', sessionEpoch: 7 },
      staffSecurity: { assurance: 'pending_enrollment' },
    });
    expect(session?.issuedAt).toBe(
      fakes.recordIdentitySessionStart.mock.calls[0]?.[0].issuedAtSeconds,
    );
  });
});
