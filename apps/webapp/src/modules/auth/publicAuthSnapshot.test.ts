import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  getPublicRuntimeBoolMock,
  getConfigValueMock,
  getLoginAlternativesPublicConfigMock,
  getSpecialistSignupEnabledMock,
} = vi.hoisted(() => ({
  getPublicRuntimeBoolMock: vi.fn(),
  getConfigValueMock: vi.fn(),
  getLoginAlternativesPublicConfigMock: vi.fn(),
  getSpecialistSignupEnabledMock: vi.fn(),
}));

// `getConfigValue` is here because yandex/google availability is no longer a bare toggle read: it goes
// through isOAuthProviderEnabled, which ALSO reads the provider credentials to decide "configured".
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: (key: string) => getPublicRuntimeBoolMock(key),
  getConfigValue: (key: string, fallback: string) => getConfigValueMock(key, fallback),
}));

vi.mock('@/modules/auth/loginAlternativesConfig', () => ({
  getLoginAlternativesPublicConfig: () => getLoginAlternativesPublicConfigMock(),
}));

vi.mock('@/modules/auth/specialistSignupRollout', () => ({
  getSpecialistSignupEnabled: () => getSpecialistSignupEnabledMock(),
}));

import { buildPrefetchedPublicAuthConfig } from './publicAuthSnapshot';

/** Credential keys that make a provider count as "configured" (id + secret + redirect, all non-blank). */
const GOOGLE_CREDENTIAL_KEYS = new Set([
  'google_client_id',
  'google_client_secret',
  'google_oauth_login_redirect_uri',
]);

describe('buildPrefetchedPublicAuthConfig', () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset();
    getConfigValueMock.mockReset();
    getLoginAlternativesPublicConfigMock.mockReset();
    getSpecialistSignupEnabledMock.mockReset();
    // Admin has switched BOTH google and yandex on. Only google is actually configured, so only google
    // may appear on the login screen -- that is the whole point of the "enabled AND configured" rule.
    getPublicRuntimeBoolMock.mockImplementation(
      async (key: string) =>
        key === 'auth_oauth_google_enabled' || key === 'auth_oauth_yandex_enabled',
    );
    getConfigValueMock.mockImplementation(async (key: string) =>
      GOOGLE_CREDENTIAL_KEYS.has(key) ? `configured-${key}` : '',
    );
    getLoginAlternativesPublicConfigMock.mockResolvedValue({
      telegramBotUsername: 'test_bot',
      maxBotOpenUrl: 'https://max.ru/test_bot',
      vkWebLoginUrl: null,
      smsFallbackEnabled: true,
      authChannelPolicy: { email: true, sms: false, telegram: true, max: false },
    });
    getSpecialistSignupEnabledMock.mockResolvedValue(false);
  });

  it('uses only derived provider availability and includes the public alternatives snapshot', async () => {
    const result = await buildPrefetchedPublicAuthConfig();

    // yandex is switched ON by the admin but has no credentials -> must stay hidden.
    expect(result.oauthProviders).toEqual({ yandex: false, google: true, apple: false });

    // The toggle keys must be the ones the admin UI actually writes. Reading `oauth_google_enabled` /
    // `oauth_yandex_enabled` (not in ALLOWED_KEYS, written by nobody) is the defect this asserts against:
    // the admin toggle then changed nothing a visitor saw.
    const toggleKeys = getPublicRuntimeBoolMock.mock.calls.map(([key]) => key).sort();
    expect(toggleKeys).toEqual([
      'auth_oauth_google_enabled',
      'auth_oauth_yandex_enabled',
      'oauth_apple_enabled',
    ]);

    expect(result.specialistSignupEnabled).toBe(false);
    expect(result.telegramBotUsername).toBe('test_bot');
    expect(result.maxBotOpenUrl).toBe('https://max.ru/test_bot');
    expect(result.authChannelPolicy).toEqual({
      email: true,
      sms: false,
      telegram: true,
      max: false,
    });
  });

  it('hides a configured provider once the admin switches it off', async () => {
    getPublicRuntimeBoolMock.mockImplementation(async () => false);

    const result = await buildPrefetchedPublicAuthConfig();

    expect(result.oauthProviders).toEqual({ yandex: false, google: false, apple: false });
  });
});
