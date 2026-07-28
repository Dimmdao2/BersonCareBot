import { beforeEach, describe, expect, it, vi } from 'vitest';

const isOAuthProviderEnabledMock = vi.hoisted(() => vi.fn());
const getPublicRuntimeBoolMock = vi.hoisted(() => vi.fn());

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: isOAuthProviderEnabledMock,
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: getPublicRuntimeBoolMock,
}));

import { GET } from './route';

describe('GET /api/auth/oauth/providers', () => {
  beforeEach(() => {
    isOAuthProviderEnabledMock.mockReset();
    getPublicRuntimeBoolMock.mockReset();
  });

  it('reports google/yandex through the enabled+configured gate and apple through the raw derived signal', async () => {
    isOAuthProviderEnabledMock.mockImplementation(
      async (provider: string) => provider === 'google',
    );
    getPublicRuntimeBoolMock.mockResolvedValue(true);

    const res = await GET(new Request('http://localhost/api/auth/oauth/providers'));
    const body = (await res.json()) as {
      ok: boolean;
      yandex: boolean;
      google: boolean;
      apple: boolean;
    };

    expect(body).toEqual({ ok: true, yandex: false, google: true, apple: true });
    expect(isOAuthProviderEnabledMock).toHaveBeenCalledWith('yandex');
    expect(isOAuthProviderEnabledMock).toHaveBeenCalledWith('google');
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith('oauth_apple_enabled');
  });

  it('hides a provider that is toggled on but unconfigured', async () => {
    isOAuthProviderEnabledMock.mockResolvedValue(false);
    getPublicRuntimeBoolMock.mockResolvedValue(false);

    const res = await GET(new Request('http://localhost/api/auth/oauth/providers'));
    const body = (await res.json()) as {
      ok: boolean;
      yandex: boolean;
      google: boolean;
      apple: boolean;
    };
    expect(body).toEqual({ ok: true, yandex: false, google: false, apple: false });
  });
});
