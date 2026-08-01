import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  publicValues: new Map<string, boolean>(),
  configuredChannels: new Map<string, boolean>(),
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  getPublicAuthChannelConfigured: vi.fn<(channel: string) => Promise<boolean>>(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicAuthChannelConfigured: fakes.getPublicAuthChannelConfigured,
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
}));

import { getAnonymousClientVisibleAuthChannelPolicy } from './anonymousAuthChannelPolicy';
import { isOAuthProviderEnabled, type OAuthProvider } from './authChannelPolicy';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.publicValues.clear();
  fakes.configuredChannels.clear();
  fakes.getPublicRuntimeBool.mockImplementation(async (key) => {
    const value = fakes.publicValues.get(key);
    if (value === undefined) throw new Error(`missing public projection: ${key}`);
    return value;
  });
  fakes.getPublicAuthChannelConfigured.mockImplementation(async (channel) => {
    const value = fakes.configuredChannels.get(channel);
    if (value === undefined) throw new Error(`missing channel capability: ${channel}`);
    return value;
  });
});

describe('public auth policy', () => {
  it('uses only boolean capabilities to hide an unconfigured channel from anonymous login', async () => {
    fakes.publicValues.set('auth_email_enabled', true);
    fakes.publicValues.set('auth_sms_enabled', true);
    fakes.publicValues.set('auth_telegram_enabled', true);
    fakes.publicValues.set('auth_max_enabled', true);
    fakes.configuredChannels.set('email', true);
    fakes.configuredChannels.set('sms', false);
    fakes.configuredChannels.set('telegram', true);
    fakes.configuredChannels.set('max', true);

    await expect(getAnonymousClientVisibleAuthChannelPolicy()).resolves.toEqual({
      email: true,
      sms: false,
      telegram: true,
      max: true,
    });
  });

  it.each([
    ['google', 'auth_oauth_google_enabled', 'oauth_google_enabled'],
    ['yandex', 'auth_oauth_yandex_enabled', 'oauth_yandex_enabled'],
    ['apple', 'auth_oauth_apple_enabled', 'oauth_apple_enabled'],
  ] as const)(
    'uses the %s public configured projection as the OAuth availability answer',
    async (provider, toggleKey, configuredKey) => {
      fakes.publicValues.set(toggleKey, true);
      fakes.publicValues.set(configuredKey, false);

      await expect(isOAuthProviderEnabled(provider as OAuthProvider)).resolves.toBe(false);
    },
  );
});
