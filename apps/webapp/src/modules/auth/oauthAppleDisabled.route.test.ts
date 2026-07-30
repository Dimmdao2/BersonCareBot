import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled: vi.fn<(provider: 'google' | 'yandex') => Promise<boolean>>(),
  resolveRateLimitClientKey: vi.fn(),
  isRateLimited: vi.fn<() => Promise<boolean>>(),
  recordFailure: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
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
  createSignedOAuthState: vi.fn(),
  parseVerifiedSignedOAuthState: vi.fn(),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getGoogleClientId: vi.fn(),
  getGoogleClientSecret: vi.fn(),
  getGoogleOauthLoginRedirectUri: vi.fn(),
  getYandexOauthClientId: vi.fn(),
  getYandexOauthClientSecret: vi.fn(),
  getYandexOauthRedirectUri: vi.fn(),
}));

import { GET as listProviders } from '@/app/api/auth/oauth/providers/route';
import { POST as startOAuth } from '@/app/api/auth/oauth/start/route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isOAuthProviderEnabled.mockResolvedValue(true);
  fakes.resolveRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-993' });
  fakes.isRateLimited.mockResolvedValue(false);
  fakes.recordFailure.mockResolvedValue(undefined);
});

describe('public OAuth provider boundary', () => {
  it('keeps Apple unavailable in both public login entry points', async () => {
    const providersResponse = await listProviders(
      new Request('https://app.example.test/api/auth/oauth/providers'),
    );

    expect(providersResponse.status).toBe(200);
    await expect(providersResponse.json()).resolves.toEqual({
      ok: true,
      yandex: true,
      google: true,
      apple: false,
    });

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
});
