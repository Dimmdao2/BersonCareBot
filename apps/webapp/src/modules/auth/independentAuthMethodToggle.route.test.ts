import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  enabled: vi.fn(),
  beginPasskeyAuthentication: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({
  stampBootstrapPrincipal: vi.fn(),
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: vi.fn(() => {
    throw new Error('disabled gate must run before DI');
  }),
}));
vi.mock('@/app-layer/principal/staffSecuritySelfPrincipal', () => ({
  enterStaffSecuritySelfPrincipal: vi.fn(),
}));
vi.mock('@/modules/auth/service', () => ({
  setSessionFromUser: vi.fn(),
}));
vi.mock('@/modules/auth/verifiedStaffPrimaryLogin', () => ({
  prepareVerifiedPrimaryLogin: vi.fn(),
}));
vi.mock('@/shared/platform-user/isPlatformUserUuid', () => ({
  isPlatformUserUuid: vi.fn(() => true),
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isIndependentAuthMethodEnabled: fakes.enabled,
}));
vi.mock('@/modules/auth/passkeyAuth', () => ({
  beginPasskeyAuthentication: fakes.beginPasskeyAuthentication,
}));
vi.mock('@/modules/auth/oauthStartRateLimit', () => ({
  resolveOAuthStartRateLimitClientKey: () => ({ ok: true, key: 'method-toggle-test' }),
  isOAuthStartRateLimitedByKey: () => Promise.resolve(false),
}));
vi.mock('@/infra/repos/pgPasskeyStore', () => ({ pgPasskeyStore: {} }));

import { POST as requestPasskeyOptions } from '@/app/api/auth/passkey/login/options/route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.enabled.mockResolvedValue(false);
});

describe('independent login method server gates', () => {
  it('rejects passkey options before creating a challenge when this surface setting is off', async () => {
    const response = await requestPasskeyOptions(
      new Request('https://app.example.test/api/auth/passkey/login/options', { method: 'POST' }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_method_disabled' });
    expect(fakes.beginPasskeyAuthentication).not.toHaveBeenCalled();
  });

  it('restores the same passkey-options route for an already enrolled credential when the setting is enabled', async () => {
    fakes.enabled.mockResolvedValue(true);
    fakes.beginPasskeyAuthentication.mockResolvedValue({
      challengeId: '00000000-0000-4000-8000-000000000123',
      publicKey: { challenge: 'credential-challenge' },
    });

    const response = await requestPasskeyOptions(
      new Request('https://app.example.test/api/auth/passkey/login/options', { method: 'POST' }),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      ok: true,
      challengeId: '00000000-0000-4000-8000-000000000123',
    });
    expect(fakes.beginPasskeyAuthentication).toHaveBeenCalledOnce();
  });
});
