import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled: vi.fn<(provider: 'google' | 'yandex' | 'apple') => Promise<boolean>>(),
  isIndependentAuthMethodEnabled: vi.fn<() => Promise<boolean>>(),
  getLoginAlternativesPublicConfig: vi.fn(),
  getSpecialistSignupEnabled: vi.fn<() => Promise<boolean>>(),
  getLegacyPublicRuntimeBool: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: fakes.isOAuthProviderEnabled,
  isIndependentAuthMethodEnabled: fakes.isIndependentAuthMethodEnabled,
}));
vi.mock('@/modules/auth/loginAlternativesConfig', () => ({
  getLoginAlternativesPublicConfig: fakes.getLoginAlternativesPublicConfig,
}));
vi.mock('@/modules/auth/specialistSignupRollout', () => ({
  getSpecialistSignupEnabled: fakes.getSpecialistSignupEnabled,
}));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: fakes.getLegacyPublicRuntimeBool,
}));

import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isOAuthProviderEnabled.mockResolvedValue(true);
  fakes.isIndependentAuthMethodEnabled.mockResolvedValue(true);
  fakes.getLoginAlternativesPublicConfig.mockResolvedValue({
    telegramBotUsername: null,
    maxBotOpenUrl: null,
    vkWebLoginUrl: null,
    smsFallbackEnabled: false,
    authChannelPolicy: { email: true, sms: false, telegram: true, max: true },
  });
  fakes.getSpecialistSignupEnabled.mockResolvedValue(true);
  fakes.getLegacyPublicRuntimeBool.mockResolvedValue(false);
});

describe('prefetched public auth config', () => {
  it('uses the effective Apple and passkey server gates in the initial login snapshot', async () => {
    const snapshot = await buildPrefetchedPublicAuthConfig();

    expect(snapshot.oauthProviders).toEqual({
      yandex: true,
      google: true,
      apple: true,
    });
    expect(snapshot.passkeyEnabled).toBe(true);
  });
});
