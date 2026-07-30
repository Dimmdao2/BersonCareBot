import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  isOAuthProviderEnabled: vi.fn<(provider: 'google' | 'yandex') => Promise<boolean>>(),
  getLoginAlternativesPublicConfig: vi.fn(),
  getSpecialistSignupEnabled: vi.fn<() => Promise<boolean>>(),
  getLegacyPublicRuntimeBool: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isOAuthProviderEnabled: fakes.isOAuthProviderEnabled,
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
  fakes.getLoginAlternativesPublicConfig.mockResolvedValue({
    telegramBotUsername: null,
    maxBotOpenUrl: null,
    vkWebLoginUrl: null,
    smsFallbackEnabled: false,
    authChannelPolicy: { email: true, sms: false, telegram: true, max: true },
  });
  fakes.getSpecialistSignupEnabled.mockResolvedValue(true);
  // A regression to the old credential-derived Apple flag would observe "configured".
  fakes.getLegacyPublicRuntimeBool.mockResolvedValue(true);
});

describe('prefetched public auth config', () => {
  it('keeps Apple hidden when its legacy configured signal is true', async () => {
    const snapshot = await buildPrefetchedPublicAuthConfig();

    expect(snapshot.oauthProviders).toEqual({
      yandex: true,
      google: true,
      apple: false,
    });
  });
});
