import { describe, expect, it, vi } from 'vitest';

/** Patient OAuth failures return to the trusted request surface, never the staff deployment origin. */

const PATIENT_ORIGIN = 'https://clinic-1074.example.test';
const ORGANIZATION_ID = '00000000-0000-4000-8000-000000001074';

const fakes = vi.hoisted(() => ({
  getResolvedSurface: vi.fn(),
  parseVerifiedSignedOAuthState: vi.fn(),
  resolveYandexOAuthConfig: vi.fn(),
  yandexOAuthStateMatchesSurface: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
}));

vi.mock('@/config/env', () => ({
  env: { APP_BASE_URL: 'https://staff.example.test' },
  webappRuntimeDatabaseIsConfigured: () => false,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.getResolvedSurface,
}));
vi.mock('@/modules/auth/oauthSignedState', () => ({
  parseVerifiedSignedOAuthState: fakes.parseVerifiedSignedOAuthState,
}));
vi.mock('@/modules/auth/yandexOAuthConfig', () => ({
  resolveYandexOAuthConfig: fakes.resolveYandexOAuthConfig,
  yandexOAuthStateMatchesSurface: fakes.yandexOAuthStateMatchesSurface,
}));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  recordAuthRegistrationFailure: fakes.recordAuthRegistrationFailure,
  recordAuthRegistrationSuccess: vi.fn(),
  registrationAttemptIdFromOAuthState: () => 'attempt-1074',
}));
vi.mock('@/modules/auth/oauthService', () => ({
  exchangeYandexCode: vi.fn(),
  fetchYandexUserInfo: vi.fn(),
}));
vi.mock('@/app-layer/product-analytics/recordAuthLogin', () => ({ recordAuthLogin: vi.fn() }));
vi.mock('@/modules/auth/service', () => ({ setSessionFromUser: vi.fn() }));
vi.mock('@/modules/auth/redirectPolicy', () => ({ getPostAuthRedirectTarget: vi.fn() }));
vi.mock('@/modules/auth/envRole', () => ({
  reconcileDbRoleWithEnvRole: vi.fn(),
  resolveRoleAsync: vi.fn(),
}));
vi.mock('@/modules/auth/oauthYandexResolve', () => ({ resolveUserIdForYandexOAuth: vi.fn() }));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({ isPlatformUserUuid: () => false }));

import { handleYandexOAuthCallbackGet } from './yandexOAuthCallbackHandler';

describe('Yandex OAuth request-surface redirect', () => {
  it('returns a patient OAuth error to the exact trusted request surface', async () => {
    const surface = {
      surface: 'patient_branded',
      publicOrigin: PATIENT_ORIGIN,
      organizationId: ORGANIZATION_ID,
      clinicSlug: 'clinic-1074',
      authPolicy: { availableMethods: ['oauth'], preferredMethod: 'oauth' },
    } as const;
    fakes.getResolvedSurface.mockResolvedValue(surface);
    fakes.parseVerifiedSignedOAuthState.mockReturnValue({
      attemptId: 'attempt-1074',
      surface: surface.surface,
      publicOrigin: surface.publicOrigin,
      organizationId: surface.organizationId,
    });
    fakes.resolveYandexOAuthConfig.mockResolvedValue({
      clientId: 'client-1074',
      clientSecret: 'secret-1074',
      redirectUri: `${PATIENT_ORIGIN}/api/auth/oauth/callback/yandex`,
    });
    fakes.yandexOAuthStateMatchesSurface.mockReturnValue(true);

    const response = await handleYandexOAuthCallbackGet(
      new Request(
        `${PATIENT_ORIGIN}/api/auth/oauth/callback/yandex?state=signed&error=access_denied`,
      ),
      {} as never,
    );

    expect(response.status).toBe(307);
    expect(response.headers.get('location')).toBe(
      `${PATIENT_ORIGIN}/app?oauth=error&reason=access_denied`,
    );
  });
});
