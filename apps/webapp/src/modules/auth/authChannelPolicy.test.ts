import { beforeEach, describe, expect, it, vi } from 'vitest';

const getPublicRuntimeBoolMock = vi.hoisted(() => vi.fn());
const getConfigValueMock = vi.hoisted(() => vi.fn());
const getIsSmtpOutboundConfiguredOrNullMock = vi.hoisted(() => vi.fn());
const integrationRuntimeMocks = vi.hoisted(() => ({
  getTelegramBotToken: vi.fn(),
  getMaxBotApiKey: vi.fn(),
  getGoogleClientId: vi.fn(),
  getGoogleClientSecret: vi.fn(),
  getGoogleOauthLoginRedirectUri: vi.fn(),
  getYandexOauthClientId: vi.fn(),
  getYandexOauthClientSecret: vi.fn(),
  getYandexOauthRedirectUri: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: getPublicRuntimeBoolMock,
  getConfigValue: getConfigValueMock,
  getIsSmtpOutboundConfiguredOrNull: getIsSmtpOutboundConfiguredOrNullMock,
}));

vi.mock('@/modules/system-settings/integrationRuntime', () => integrationRuntimeMocks);

import {
  getAuthChannelPolicy,
  getAuthChannelPolicyDetail,
  getClientVisibleAuthChannelPolicy,
  getOAuthProviderPolicyDetail,
  isAuthChannelEnabled,
  isOAuthProviderEnabled,
} from './authChannelPolicy';

const SMTP_CONFIGURED_JSON = JSON.stringify({
  value: {
    host: 'smtp.example.com',
    port: 587,
    secure: false,
    user: 'u',
    password: 'p',
    from: 'a@b.co',
  },
});

describe('auth channel policy', () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset().mockResolvedValue(true);
    // Default: accessor unavailable (null) so existing legacy-path tests below are unaffected;
    // the dedicated "app.is_smtp_outbound_configured()" describe block below overrides this.
    getIsSmtpOutboundConfiguredOrNullMock.mockReset().mockResolvedValue(null);
    getConfigValueMock.mockReset().mockImplementation(async (key: string) => {
      if (key === 'smtp_outbound') return SMTP_CONFIGURED_JSON;
      if (key === 'smsc_api_key') return 'sms-key';
      return '';
    });
    integrationRuntimeMocks.getTelegramBotToken.mockReset().mockResolvedValue('bot-token');
    integrationRuntimeMocks.getMaxBotApiKey.mockReset().mockResolvedValue('max-key');
    integrationRuntimeMocks.getGoogleClientId.mockReset().mockResolvedValue('g-id');
    integrationRuntimeMocks.getGoogleClientSecret.mockReset().mockResolvedValue('g-secret');
    integrationRuntimeMocks.getGoogleOauthLoginRedirectUri
      .mockReset()
      .mockResolvedValue('https://app/cb/google');
    integrationRuntimeMocks.getYandexOauthClientId.mockReset().mockResolvedValue('y-id');
    integrationRuntimeMocks.getYandexOauthClientSecret.mockReset().mockResolvedValue('y-secret');
    integrationRuntimeMocks.getYandexOauthRedirectUri
      .mockReset()
      .mockResolvedValue('https://app/cb/yandex');
  });

  it('maps each channel to its canonical public-runtime key', async () => {
    await expect(isAuthChannelEnabled('sms')).resolves.toBe(true);
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith('auth_sms_enabled', 'public_auth_config');
  });

  it('isAuthChannelEnabled stays toggle-only — the pre-existing ~30-route enforcement contract is unchanged', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    integrationRuntimeMocks.getTelegramBotToken.mockResolvedValue('');
    // Unconfigured must NOT flip this — only getClientVisibleAuthChannelPolicy narrows for the client.
    await expect(isAuthChannelEnabled('telegram')).resolves.toBe(true);
  });

  it('client-visible policy is enabled only when the toggle is on AND the channel is configured', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    integrationRuntimeMocks.getTelegramBotToken.mockResolvedValue('');
    await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ telegram: false });
  });

  it('client-visible policy stays disabled when configured but the admin toggle is off', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(false);
    await expect(getClientVisibleAuthChannelPolicy()).resolves.toEqual({
      email: false,
      sms: false,
      telegram: false,
      max: false,
    });
  });

  it('client-visible policy treats a malformed stored SMTP config as unconfigured', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    getConfigValueMock.mockImplementation(async (key: string) =>
      key === 'smtp_outbound' ? 'not-json' : '',
    );
    await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: false });
  });

  it('returns the complete independent policy', async () => {
    getPublicRuntimeBoolMock.mockImplementation(async (key: string) => key !== 'auth_sms_enabled');

    await expect(getAuthChannelPolicy()).resolves.toEqual({
      email: true,
      sms: false,
      telegram: true,
      max: true,
    });
  });

  it('exposes enabled/configured separately for the admin warning UI', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    getConfigValueMock.mockImplementation(async (key: string) =>
      key === 'smsc_api_key' ? '' : '',
    );
    await expect(getAuthChannelPolicyDetail()).resolves.toMatchObject({
      email: { enabled: true, configured: false },
      sms: { enabled: true, configured: false },
    });
  });

  it('OAuth: enabled only when the independent toggle is on AND credentials are present', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    await expect(isOAuthProviderEnabled('google')).resolves.toBe(true);
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith(
      'auth_oauth_google_enabled',
      'public_auth_config',
    );

    integrationRuntimeMocks.getGoogleClientSecret.mockResolvedValue('');
    await expect(isOAuthProviderEnabled('google')).resolves.toBe(false);
  });

  it('OAuth: stays disabled when configured but the admin toggle is off, regardless of credentials', async () => {
    getPublicRuntimeBoolMock.mockResolvedValue(false);
    await expect(isOAuthProviderEnabled('yandex')).resolves.toBe(false);
  });

  it('OAuth: admin detail view reports enabled/configured independently', async () => {
    getPublicRuntimeBoolMock.mockImplementation(
      async (key: string) => key === 'auth_oauth_google_enabled',
    );
    integrationRuntimeMocks.getYandexOauthClientSecret.mockResolvedValue('');
    await expect(getOAuthProviderPolicyDetail()).resolves.toEqual({
      google: { enabled: true, configured: true },
      yandex: { enabled: false, configured: false },
    });
  });

  describe('isSmtpConfigured — app.is_smtp_outbound_configured() accessor path', () => {
    beforeEach(() => {
      getPublicRuntimeBoolMock.mockResolvedValue(true);
    });

    it('reports configured when the boolean-only accessor resolves true, without consulting the legacy raw read', async () => {
      getIsSmtpOutboundConfiguredOrNullMock.mockResolvedValue(true);
      // Legacy path would say "unconfigured" here — proves the accessor takes priority.
      getConfigValueMock.mockImplementation(async () => '');

      await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: true });
      expect(getConfigValueMock).not.toHaveBeenCalledWith('smtp_outbound', '');
    });

    it('reports not configured when the accessor resolves false, even if the legacy raw read would say configured', async () => {
      getIsSmtpOutboundConfiguredOrNullMock.mockResolvedValue(false);
      getConfigValueMock.mockImplementation(async (key: string) =>
        key === 'smtp_outbound' ? SMTP_CONFIGURED_JSON : '',
      );

      await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: false });
    });

    it('falls back to the legacy raw read when the accessor is unavailable (e.g. an older DB before migration 0240), and still reports configured', async () => {
      getIsSmtpOutboundConfiguredOrNullMock.mockResolvedValue(null);
      getConfigValueMock.mockImplementation(async (key: string) =>
        key === 'smtp_outbound' ? SMTP_CONFIGURED_JSON : '',
      );

      await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: true });
    });

    it('never throws — an accessor rejection degrades to the legacy fallback instead of crashing the login screen', async () => {
      getIsSmtpOutboundConfiguredOrNullMock.mockRejectedValue(
        new Error('permission denied for function'),
      );
      getConfigValueMock.mockImplementation(async (key: string) =>
        key === 'smtp_outbound' ? SMTP_CONFIGURED_JSON : '',
      );

      await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: true });
    });

    it('degrades to false (never throws) when both the accessor rejects and the legacy read is unconfigured', async () => {
      getIsSmtpOutboundConfiguredOrNullMock.mockRejectedValue(new Error('unexpected'));
      getConfigValueMock.mockImplementation(async () => '');

      await expect(getClientVisibleAuthChannelPolicy()).resolves.toMatchObject({ email: false });
    });
  });
});
