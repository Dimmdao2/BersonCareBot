import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled:
    vi.fn<(provider: 'google' | 'yandex' | 'apple' | 'vk') => Promise<boolean>>(),
  isIndependentAuthMethodEnabled: vi.fn<() => Promise<boolean>>(),
  getAnonymousLoginAlternativesPublicConfig: vi.fn(),
  getSpecialistSignupEnabled: vi.fn<() => Promise<boolean>>(),
  getLegacyPublicRuntimeBool: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: fakes.isOAuthProviderEnabled,
  isIndependentAuthMethodEnabled: fakes.isIndependentAuthMethodEnabled,
}));
vi.mock('@/modules/auth/loginAlternativesConfig', () => ({
  getAnonymousLoginAlternativesPublicConfig: fakes.getAnonymousLoginAlternativesPublicConfig,
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
  fakes.getAnonymousLoginAlternativesPublicConfig.mockResolvedValue({
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
  it('uses the effective server gates (incl. VK) and passkey gate in the initial login snapshot', async () => {
    const snapshot = await buildPrefetchedPublicAuthConfig();

    expect(snapshot.oauthProviders).toEqual({
      yandex: true,
      google: true,
      vk: true,
      apple: true,
    });
    expect(snapshot.passkeyEnabled).toBe(true);
  });

  it('hides VK from the snapshot when the provider gate reports disabled/unconfigured', async () => {
    fakes.isOAuthProviderEnabled.mockImplementation(async (provider) => provider !== 'vk');

    const snapshot = await buildPrefetchedPublicAuthConfig();

    expect(snapshot.oauthProviders).toEqual({
      yandex: true,
      google: true,
      vk: false,
      apple: true,
    });
  });
});
