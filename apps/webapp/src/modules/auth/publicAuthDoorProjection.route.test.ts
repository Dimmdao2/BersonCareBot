import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  getPublicAuthChannelConfigured: vi.fn<() => Promise<boolean>>(),
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  getPublicRuntimeValue: vi.fn<(key: string) => Promise<string>>(),
  getOptionalResolvedSurface: vi.fn(),
  getSpecialistSignupEnabled: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/modules/auth/authRouteObservability', () => ({ logAuthRouteTiming: vi.fn() }));
vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicAuthChannelConfigured: fakes.getPublicAuthChannelConfigured,
  getPublicRuntimeBool: fakes.getPublicRuntimeBool,
  getPublicRuntimeValue: fakes.getPublicRuntimeValue,
}));
vi.mock('@/shared/lib/surface/requestSurface.server', () => ({
  getOptionalResolvedSurface: fakes.getOptionalResolvedSurface,
}));
vi.mock('@/modules/auth/specialistSignupRollout', () => ({
  getSpecialistSignupEnabled: fakes.getSpecialistSignupEnabled,
}));

import { GET as getTelegramWidgetConfig } from '@/app/api/auth/telegram-login/config/route';
import { buildPrefetchedPublicAuthConfig } from '@/modules/auth/publicAuthSnapshot';

const PUBLIC_VALUES: Readonly<Record<string, string>> = {
  telegram_login_bot_username: 'code_delivery_bot',
  telegram_login_widget_bot_username: '@widget_login_bot',
  max_login_bot_nickname: 'max_login_bot',
  vk_web_login_url: 'https://vk.example.test/login',
};

beforeEach(() => {
  vi.clearAllMocks();
  fakes.getPublicAuthChannelConfigured.mockResolvedValue(true);
  fakes.getPublicRuntimeValue.mockImplementation(async (key) => PUBLIC_VALUES[key] ?? '');
  fakes.getPublicRuntimeBool.mockImplementation(async (key) => {
    if (key === 'public_sms_fallback_enabled') return true;
    if (key === 'oauth_vk_enabled') return false;
    return true;
  });
  fakes.getSpecialistSignupEnabled.mockResolvedValue(true);
  fakes.getOptionalResolvedSurface.mockResolvedValue({
    surface: 'staff',
    publicOrigin: 'https://shared.example.test',
    authPolicy: { availableMethods: ['password'], enabledMethods: ['password'] },
  });
});

describe('public auth door projections', () => {
  it('builds the patient snapshot from the named door even when Host resolves to staff', async () => {
    const snapshot = await buildPrefetchedPublicAuthConfig('patient');

    expect(snapshot).toMatchObject({
      oauthProviders: expect.objectContaining({ google: true, vk: false }),
      telegramBotUsername: null,
      maxBotOpenUrl: 'https://max.ru/max_login_bot',
      vkWebLoginUrl: 'https://vk.example.test/login',
      smsFallbackEnabled: true,
      authChannelPolicy: expect.objectContaining({ email: true }),
    });
  });

  it('returns only the separately configured Login Widget bot from its HTTP door', async () => {
    fakes.getOptionalResolvedSurface.mockResolvedValue({
      surface: 'patient_default',
      publicOrigin: 'https://patient.example.test',
      authPolicy: {
        availableMethods: ['email_code', 'phone_bot', 'oauth'],
        enabledMethods: ['email_code', 'phone_bot', 'oauth'],
      },
    });

    const response = await getTelegramWidgetConfig(
      new Request('https://patient.example.test/api/auth/telegram-login/config'),
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      botUsername: 'widget_login_bot',
    });
  });
});
