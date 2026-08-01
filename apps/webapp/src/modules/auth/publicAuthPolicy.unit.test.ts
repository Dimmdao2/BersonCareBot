import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  publicValues: new Map<string, boolean>(),
  configuredChannels: new Map<string, boolean>(),
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  getPublicAuthChannelConfigured: vi.fn<(channel: string) => Promise<boolean>>(),
  getConfigValue: vi.fn<(key: string) => Promise<string>>(),
  getTelegramBotToken: vi.fn<() => Promise<string>>(),
  getMaxBotApiKey: vi.fn<() => Promise<string>>(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getConfigValue: fakes.getConfigValue,
  getPublicAuthChannelConfigured: fakes.getPublicAuthChannelConfigured,
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getTelegramBotToken: fakes.getTelegramBotToken,
  getMaxBotApiKey: fakes.getMaxBotApiKey,
}));

import { getAnonymousClientVisibleAuthChannelPolicy } from './anonymousAuthChannelPolicy';
import { isOAuthProviderEnabled, type OAuthProvider } from './authChannelPolicy';
import { getAuthChannelPolicyDetail } from './authChannelPolicyAdmin';

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
  fakes.getConfigValue.mockImplementation(async (key) => {
    if (key === 'smtp_outbound') {
      return JSON.stringify({
        host: 'smtp.example.test',
        port: 465,
        secure: true,
        user: 'mailer',
        password: 'fixture-password',
        from: 'mailer@example.test',
      });
    }
    if (key === 'smsc_api_key') return 'fixture-smsc-key';
    throw new Error(`unexpected restricted setting: ${key}`);
  });
  fakes.getTelegramBotToken.mockResolvedValue('fixture-telegram-token');
  fakes.getMaxBotApiKey.mockResolvedValue('fixture-max-key');
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

  it('keeps credential-backed configured detail on the authenticated admin accessor', async () => {
    for (const key of [
      'auth_email_enabled',
      'auth_sms_enabled',
      'auth_telegram_enabled',
      'auth_max_enabled',
    ]) {
      fakes.publicValues.set(key, true);
    }

    await expect(getAuthChannelPolicyDetail()).resolves.toEqual({
      email: { enabled: true, configured: true },
      sms: { enabled: true, configured: true },
      telegram: { enabled: true, configured: true },
      max: { enabled: true, configured: true },
    });
    expect(fakes.getConfigValue).toHaveBeenCalledWith('smtp_outbound');
    expect(fakes.getConfigValue).toHaveBeenCalledWith('smsc_api_key');
    expect(fakes.getTelegramBotToken).toHaveBeenCalledOnce();
    expect(fakes.getMaxBotApiKey).toHaveBeenCalledOnce();
  });
});
