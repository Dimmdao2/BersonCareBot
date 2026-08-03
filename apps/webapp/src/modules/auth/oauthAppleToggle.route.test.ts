import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled: vi.fn<(provider: 'google' | 'yandex' | 'apple') => Promise<boolean>>(),
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
  createAppleSignedOAuthState: vi.fn(),
  createSignedOAuthState: vi.fn(),
  parseVerifiedSignedOAuthState: vi.fn(),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getGoogleClientId: vi.fn().mockResolvedValue('google-client'),
  getGoogleClientSecret: vi.fn().mockResolvedValue('google-secret'),
  getGoogleOauthLoginRedirectUri: vi
    .fn()
    .mockResolvedValue('https://app.example.test/google-callback'),
  getYandexOauthClientId: vi.fn().mockResolvedValue('yandex-client'),
  getYandexOauthClientSecret: vi.fn().mockResolvedValue('yandex-secret'),
  getYandexOauthRedirectUri: vi.fn().mockResolvedValue('https://app.example.test/yandex-callback'),
  getAppleOauthClientId: () => Promise.resolve('apple-client'),
  getAppleOauthRedirectUri: () => Promise.resolve('https://app.example.test/callback'),
  getAppleOauthTeamId: () => Promise.resolve('team'),
  getAppleOauthKeyId: () => Promise.resolve('key'),
  getAppleOauthPrivateKey: () => Promise.resolve('private-key'),
}));

import { GET as listProviders } from '@/app/api/auth/oauth/providers/route';
import { POST as startOAuth } from '@/app/api/auth/oauth/start/route';
import { getYandexOauthClientId } from '@/modules/system-settings/integrationRuntime';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isOAuthProviderEnabled.mockImplementation(async (provider) => provider !== 'apple');
  fakes.resolveRateLimitClientKey.mockReturnValue({ ok: true, key: 'client-993' });
  fakes.isRateLimited.mockResolvedValue(false);
  fakes.recordFailure.mockResolvedValue(undefined);
});

describe('public OAuth provider boundary', () => {
  it('rejects Apple in both public entry points when its independent toggle is off', async () => {
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

  it('returns a typed our-side failure instead of an empty body when reading provider config throws', async () => {
    vi.mocked(getYandexOauthClientId).mockRejectedValueOnce(
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
    await expect(startResponse.json()).resolves.toEqual({
      ok: false,
      error: 'server_error',
      message: 'Не удалось начать вход из-за сбоя на нашей стороне. Повторите попытку позже.',
    });
  });
});
