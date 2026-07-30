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
import { POST as loginByPin } from '@/app/api/auth/pin/login/route';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.enabled.mockResolvedValue(false);
});

describe('independent login method server gates', () => {
  it('rejects passkey options before creating a challenge when the global toggle is off', async () => {
    const response = await requestPasskeyOptions(
      new Request('https://app.example.test/api/auth/passkey/login/options', { method: 'POST' }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_method_disabled' });
    expect(fakes.beginPasskeyAuthentication).not.toHaveBeenCalled();
  });

  it('rejects direct PIN API login when the global toggle is off', async () => {
    const response = await loginByPin(
      new Request('https://app.example.test/api/auth/pin/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ phone: '+79990000000', pin: '1234' }),
      }),
    );
    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_method_disabled' });
  });
});
