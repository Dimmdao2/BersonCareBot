import { beforeEach, describe, expect, it, vi } from 'vitest';

type StoredCookie = { value: string; maxAge?: number };
const browserCookies = new Map<string, StoredCookie>();

const fakes = vi.hoisted(() => ({
  providerEnabled: vi.fn(),
  resolveRateLimitClientKey: vi.fn(),
  isRateLimited: vi.fn(),
  resolvedSurface: vi.fn(),
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => browserCookies.get(name),
    set: (name: string, value: string, options?: { maxAge?: number }) => {
      if (options?.maxAge === 0) browserCookies.delete(name);
      else browserCookies.set(name, { value, maxAge: options?.maxAge });
    },
  }),
}));
vi.mock('@/config/env', () => ({
  env: {
    APP_BASE_URL: 'https://app.example.test',
    SESSION_COOKIE_SECRET: 'oauth-state-binding-route-test-secret',
  },
  isProduction: false,
}));
vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/bindAuthModulePorts', () => ({
  ensureAuthModulePortsBound: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({ buildAppDeps: vi.fn(() => ({})) }));
vi.mock('@/app-layer/logging/logger', () => ({ logger: { error: vi.fn() } }));
vi.mock('@/app-layer/product-analytics/recordAuthRegistration', () => ({
  newRegistrationAttemptId: () => 'new-attempt',
  recordAuthRegistrationAttempt: vi.fn(),
  recordAuthRegistrationFailure: vi.fn(),
  registrationAttemptIdFromOAuthState: () => 'oauth-attempt',
}));
vi.mock('@/app-layer/product-analytics/registrationOAuthWebCallback', () => ({
  logOAuthWebCallbackFailure: vi.fn(),
  logOAuthWebCallbackRegistrationSuccess: vi.fn(),
}));
vi.mock('@/modules/auth/oauthStartRateLimit', () => ({
  resolveOAuthStartRateLimitClientKey: fakes.resolveRateLimitClientKey,
  isOAuthStartRateLimitedByKey: fakes.isRateLimited,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: fakes.providerEnabled,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getResolvedSurface: fakes.resolvedSurface,
}));
vi.mock('@/shared/lib/surface/requestSurface', () => ({
  arePlatformSurfaceHostsDistinct: () => true,
}));
vi.mock('@/config/surfaceRoutes', () => ({ canSurfaceEnterRoute: () => true }));
vi.mock('@/modules/auth/yandexOAuthConfig', () => ({
  resolveYandexOAuthConfig: vi.fn(),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getGoogleClientId: async () => 'google-client',
  getGoogleClientSecret: async () => 'google-secret',
  getGoogleOauthLoginRedirectUri: async () =>
    'https://app.example.test/api/auth/oauth/callback/google',
  getAppleOauthClientId: async () => '',
  getAppleOauthRedirectUri: async () => '',
  getAppleOauthTeamId: async () => '',
  getAppleOauthKeyId: async () => '',
  getAppleOauthPrivateKey: async () => '',
  getVkIdApplicationId: async () => '',
  getVkIdClientSecret: async () => '',
  getVkIdRedirectUri: async () => '',
}));
vi.mock('@/modules/google-calendar/googleOAuthHelpers', () => ({
  exchangeGoogleCode: vi.fn(),
  fetchGoogleUserProfile: vi.fn(),
}));
vi.mock('@/modules/auth/oauthWebLoginResolve', () => ({
  resolveUserIdForWebOAuthLogin: vi.fn(),
}));
vi.mock('@/modules/auth/oauthWebSession', () => ({
  completeOAuthWebLoginRedirectUrls: vi.fn(),
  oauthWebLoginErrorRedirect: (reason: string) => `/app?oauth=error&reason=${reason}`,
}));

import { POST as startOAuth } from '@/app/api/auth/oauth/start/route';
import { GET as googleCallback } from '@/app/api/auth/oauth/callback/google/route';

async function startGoogleLogin(): Promise<string> {
  const response = await startOAuth(
    new Request('https://app.example.test/api/auth/oauth/start', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ provider: 'google', roleLoginPortal: 'patient' }),
    }),
  );
  expect(response.status).toBe(200);
  const body = (await response.json()) as { authUrl: string };
  return new URL(body.authUrl).searchParams.get('state') ?? '';
}

beforeEach(() => {
  browserCookies.clear();
  vi.clearAllMocks();
  fakes.providerEnabled.mockResolvedValue(true);
  fakes.resolveRateLimitClientKey.mockReturnValue({ ok: true, key: 'client' });
  fakes.isRateLimited.mockResolvedValue(false);
  fakes.resolvedSurface.mockResolvedValue({
    surface: 'patient_default',
    publicOrigin: 'https://app.example.test',
    authPolicy: { availableMethods: ['oauth'], enabledMethods: ['oauth'] },
  });
});

describe('OAuth state browser binding door', () => {
  it('rejects the same state after its first callback consumed the browser cookie', async () => {
    const state = await startGoogleLogin();

    const first = await googleCallback(
      new Request(`https://app.example.test/api/auth/oauth/callback/google?state=${state}`),
    );
    expect(first.headers.get('location')).toContain('reason=no_code');

    const replay = await googleCallback(
      new Request(`https://app.example.test/api/auth/oauth/callback/google?state=${state}`),
    );
    expect(replay.status).toBe(403);
    await expect(replay.json()).resolves.toMatchObject({ error: 'oauth_csrf' });
  });

  it('rejects a valid signed state in a browser without the issuing cookie', async () => {
    const state = await startGoogleLogin();
    await startGoogleLogin();

    const response = await googleCallback(
      new Request(`https://app.example.test/api/auth/oauth/callback/google?state=${state}`),
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'oauth_csrf' });
  });
});
