import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled:
    vi.fn<
      (
        provider: 'google' | 'yandex' | 'apple' | 'vk',
        surface?: 'staff' | 'platform_admin' | 'patient',
      ) => Promise<boolean>
    >(),
  resolveRateLimitClientKey: vi.fn(),
  isRateLimited: vi.fn<() => Promise<boolean>>(),
  recordFailure: vi.fn(),
  resolveYandexOAuthConfig: vi.fn(),
  parseSignedState: vi.fn(),
  resolvedSurface: vi.fn(),
  platformHostsDistinct: vi.fn(),
  canSurfaceEnterRoute: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'registration-attempt-993',
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: fakes.recordFailure,
  registrationAttemptIdFromOAuthState: vi.fn(),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: fakes.isOAuthProviderEnabled,
}));
vi.mock('@/modules/auth/authRouteObservability', () => ({
  logAuthRouteTiming: vi.fn(),
}));
vi.mock('@/modules/auth/oauthStartRateLimit', () => ({
  resolveOAuthStartRateLimitClientKey: fakes.resolveRateLimitClientKey,
  isOAuthStartRateLimitedByKey: fakes.isRateLimited,
}));
vi.mock('@/modules/auth/oauthSignedState', () => ({
  createAppleSignedOAuthState: vi.fn(() => ({ state: 'signed-apple-state', nonce: 'apple-nonce' })),
  createSignedOAuthState: vi.fn(() => 'signed-oauth-state'),
  createVkSignedOAuthState: vi.fn(() => ({
    state: 'signed-vk-state',
    attemptId: 'vk-attempt',
    codeVerifier: 'vk-verifier',
    codeChallenge: 'vk-challenge',
  })),
  parseVerifiedSignedOAuthState: fakes.parseSignedState,
  roleLoginPortalFromOAuthState: (state: { roleLoginPortal?: 'doctor' | 'patient' | 'admin' }) =>
    state.roleLoginPortal ?? 'patient',
}));
vi.mock('@/modules/auth/oauthStateBinding.server', () => ({
  OAUTH_STATE_BINDING_TTL_SECONDS: 600,
  issueOAuthStateBrowserBinding: vi.fn().mockResolvedValue('binding-hash'),
  consumeBrowserBoundOAuthState: fakes.parseSignedState,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.resolvedSurface,
}));
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  arePlatformSurfaceHostsDistinct: fakes.platformHostsDistinct,
}));
vi.mock('@/config/surfaceRoutes', () => ({
  canSurfaceEnterRoute: fakes.canSurfaceEnterRoute,
}));
vi.mock('@/modules/auth/yandexOAuthConfig', () => ({
  resolveYandexOAuthConfig: fakes.resolveYandexOAuthConfig,
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getGoogleClientId: vi.fn().mockResolvedValue('google-client'),
  getGoogleClientSecret: vi.fn().mockResolvedValue('google-secret'),
  getGoogleOauthLoginRedirectUri: vi
    .fn()
    .mockResolvedValue('https://app.example.test/google-callback'),
  getAppleOauthClientId: () => Promise.resolve('apple-client'),
  getAppleOauthRedirectUri: () => Promise.resolve('https://app.example.test/callback'),
  getAppleOauthTeamId: () => Promise.resolve('team'),
  getAppleOauthKeyId: () => Promise.resolve('key'),
  getAppleOauthPrivateKey: () => Promise.resolve('private-key'),
  getVkIdApplicationId: () => Promise.resolve('vk-client'),
  getVkIdRedirectUri: () => Promise.resolve('https://app.example.test/vk-callback'),
  getVkIdClientSecret: () => Promise.resolve('vk-secret'),
}));

import { POST as startOAuth } from '@/app/api/auth/oauth/start/route';
import { POST as appleCallback } from '@/app/api/auth/oauth/callback/apple/route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isOAuthProviderEnabled.mockImplementation(async (provider) => provider !== 'apple');
  fakes.resolveRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-993' });
  fakes.isRateLimited.mockResolvedValue(false);
  fakes.recordFailure.mockResolvedValue(undefined);
  fakes.resolveYandexOAuthConfig.mockResolvedValue(null);
  fakes.parseSignedState.mockReturnValue({
    attemptId: 'oauth-attempt',
    nonce: 'apple-nonce',
    roleLoginPortal: 'patient',
  });
  fakes.resolvedSurface.mockResolvedValue({
    surface: 'patient_default',
    publicOrigin: 'https://app.example.test',
    authPolicy: { availableMethods: ['oauth'], enabledMethods: ['oauth'] },
  });
  fakes.platformHostsDistinct.mockReturnValue(true);
  fakes.canSurfaceEnterRoute.mockReturnValue(true);
});

describe('public OAuth provider boundary', () => {
  it('rejects Apple at OAuth start when its independent toggle is off', async () => {
    const startResponse = await startOAuth(
      new Request('https://app.example.test/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'apple' }),
      }),
    );

    expect(startResponse.status).toBe(501);
    await expect(startResponse.json()).resolves.toMatchObject({
      ok: false,
      error: 'oauth_disabled',
    });
  });

  it('uses the same per-surface OAuth setting at start and callback boundaries', async () => {
    const disabledStart = await startOAuth(
      new Request('https://staff.example.test/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'apple' }),
      }),
    );
    const disabledCallback = await appleCallback(
      new Request('https://staff.example.test/api/auth/oauth/callback/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'state=signed-apple-state',
      }),
    );

    expect(disabledStart.status).toBe(501);
    await expect(disabledStart.json()).resolves.toMatchObject({ error: 'oauth_disabled' });
    expect(disabledCallback.headers.get('location')).toContain('oauth=error&reason=oauth_disabled');

    fakes.isOAuthProviderEnabled.mockResolvedValue(true);
    const enabledStart = await startOAuth(
      new Request('https://staff.example.test/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'apple' }),
      }),
    );
    const enabledCallback = await appleCallback(
      new Request('https://staff.example.test/api/auth/oauth/callback/apple', {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: 'state=signed-apple-state',
      }),
    );

    expect(enabledStart.status).toBe(200);
    await expect(enabledStart.json()).resolves.toMatchObject({
      ok: true,
      authUrl: expect.any(String),
    });
    expect(enabledCallback.headers.get('location')).toContain('reason=no_code');
  });

  it.each(['yandex', 'google', 'vk', 'apple'] as const)(
    'uses the named patient door instead of the shared Host policy for %s',
    async (provider) => {
      fakes.resolvedSurface.mockResolvedValue({
        surface: 'staff',
        publicOrigin: 'https://shared.example.test',
        authPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
      });
      fakes.platformHostsDistinct.mockReturnValue(false);
      fakes.isOAuthProviderEnabled.mockImplementation(
        async (candidate, surface) => candidate === provider && surface === 'patient',
      );
      fakes.resolveYandexOAuthConfig.mockImplementation(async (_surface, authPolicySurface) =>
        provider === 'yandex' && authPolicySurface === 'patient'
          ? {
              clientId: 'yandex-client',
              clientSecret: 'yandex-secret',
              redirectUri: 'https://shared.example.test/api/auth/oauth/callback/yandex',
            }
          : null,
      );

      const response = await startOAuth(
        new Request('https://shared.example.test/api/auth/oauth/start', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ provider, roleLoginPortal: 'patient' }),
        }),
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toMatchObject({
        ok: true,
        authUrl: expect.any(String),
      });
    },
  );

  it('refuses a named patient door on a distinct staff Host', async () => {
    fakes.resolvedSurface.mockResolvedValue({
      surface: 'staff',
      publicOrigin: 'https://staff.example.test',
      authPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
    });
    fakes.platformHostsDistinct.mockReturnValue(true);
    fakes.canSurfaceEnterRoute.mockReturnValue(false);
    fakes.isOAuthProviderEnabled.mockResolvedValue(true);

    const response = await startOAuth(
      new Request('https://staff.example.test/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'google', roleLoginPortal: 'patient' }),
      }),
    );

    expect(response.status).toBe(501);
    await expect(response.json()).resolves.toMatchObject({ ok: false, error: 'oauth_disabled' });
  });

  it('returns a typed our-side failure instead of an empty body when resolving provider config throws', async () => {
    fakes.resolveYandexOAuthConfig.mockRejectedValueOnce(
      new Error('permission denied for table system_settings'),
    );

    const startResponse = await startOAuth(
      new Request('https://app.example.test/api/auth/oauth/start', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ provider: 'yandex' }),
      }),
    );

    expect(startResponse.status).toBe(500);
    // Формулировка не проверяется (владелец 13.09: тестов на тексты быть не должно);
    // проверяется контракт ответа — отказ и машинный код.
    await expect(startResponse.json()).resolves.toMatchObject({
      ok: false,
      error: 'server_error',
    });
  });
});
