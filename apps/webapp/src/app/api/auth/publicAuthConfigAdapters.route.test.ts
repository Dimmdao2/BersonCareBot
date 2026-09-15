import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  buildPrefetchedPublicAuthConfig: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/modules/auth/authRouteObservability', () => ({ logAuthRouteTiming: vi.fn() }));
vi.mock('@/modules/auth/publicAuthSnapshot', () => ({
  buildPrefetchedPublicAuthConfig: fakes.buildPrefetchedPublicAuthConfig,
}));

import { GET as getAlternativesConfig } from './login/alternatives-config/route';
import { GET as getOAuthProviders } from './oauth/providers/route';

const snapshot = {
  oauthProviders: { yandex: false, google: true, vk: false, apple: true },
  passkeyEnabled: false,
  telegramBotUsername: null,
  maxBotOpenUrl: 'https://max.ru/external_login_bot',
  vkWebLoginUrl: 'https://vk.example.test/login',
  smsFallbackEnabled: true,
  specialistSignupEnabled: true,
  authChannelPolicy: { email: true, sms: true, telegram: false, max: true },
  fetchedAt: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.buildPrefetchedPublicAuthConfig.mockResolvedValue(snapshot);
});

describe('public auth config adapters', () => {
  it('projects a changed shared snapshot through both documented external HTTP contracts', async () => {
    const [alternatives, providers] = await Promise.all([
      getAlternativesConfig(
        new Request('https://external-client.example.test/api/auth/login/alternatives-config'),
      ),
      getOAuthProviders(new Request('https://external-client.example.test/api/auth/oauth/providers')),
    ]);

    expect(alternatives.status).toBe(200);
    await expect(alternatives.json()).resolves.toEqual({
      ok: true,
      telegramBotUsername: null,
      maxBotOpenUrl: 'https://max.ru/external_login_bot',
      vkWebLoginUrl: 'https://vk.example.test/login',
      smsFallbackEnabled: true,
      authChannelPolicy: { email: true, sms: true, telegram: false, max: true },
      specialistSignupEnabled: true,
    });
    expect(providers.headers.get('Cache-Control')).toBe('private, no-store');
    await expect(providers.json()).resolves.toEqual({
      ok: true,
      yandex: false,
      google: true,
      vk: false,
      apple: true,
    });
  });
});
