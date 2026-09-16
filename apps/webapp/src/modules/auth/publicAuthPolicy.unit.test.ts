import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  publicValues: new Map<string, boolean>(),
  configuredChannels: new Map<string, boolean>(),
  getPublicRuntimeBool: vi.fn<(key: string) => Promise<boolean>>(),
  getPublicAuthChannelConfigured: vi.fn<(channel: string) => Promise<boolean>>(),
  getConfigValue: vi.fn<(key: string) => Promise<string>>(),
  getTelegramBotToken: vi.fn<() => Promise<string>>(),
  getMaxBotApiKey: vi.fn<() => Promise<string>>(),
  resolvedSurfaceHeaderPresent: { value: true },
  requestSurface: { value: 'staff' as 'staff' | 'platform_admin' | 'patient_default' },
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
vi.mock('next/headers', () => ({
  headers: async () => {
    if (!fakes.resolvedSurfaceHeaderPresent.value) return new Headers();
    return new Headers({
      'x-bc-resolved-surface': encodeURIComponent(
        JSON.stringify({
          surface: fakes.requestSurface.value,
          publicOrigin: 'https://surface.example.test',
          authPolicy: {
            availableMethods: ['password', 'email_code', 'phone_bot', 'totp', 'oauth', 'passkey'],
            enabledMethods: ['email_code'],
          },
        }),
      ),
    });
  },
}));

import { getAnonymousClientVisibleAuthChannelPolicy } from './anonymousAuthChannelPolicy';
import {
  isAuthChannelEnabled,
  getAuthChannelPolicy,
  isIndependentAuthMethodEnabled,
  isOAuthProviderEnabled,
  type OAuthProvider,
} from './authChannelPolicy';
import { getAuthChannelPolicyDetail } from './authChannelPolicyAdmin';
import { SURFACE_AUTH_CONTROLS, patientSurfaceAuthSettingKey } from './surfaceAuthSettings';
import type { SurfaceAuthPolicyName } from '@/shared/lib/surface/surfaceAuthPolicy';

beforeEach(() => {
  vi.clearAllMocks();
  fakes.publicValues.clear();
  fakes.configuredChannels.clear();
  fakes.resolvedSurfaceHeaderPresent.value = true;
  fakes.requestSurface.value = 'staff';
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

function selectPolicySurface(surface: SurfaceAuthPolicyName): void {
  fakes.requestSurface.value = surface === 'patient' ? 'patient_default' : surface;
}

describe('public auth policy', () => {
  it('ignores persisted staff/admin surface values and keeps their door composition in code', async () => {
    for (const surface of ['staff', 'platform_admin'] as const) {
      for (const control of SURFACE_AUTH_CONTROLS) {
        fakes.publicValues.set(`auth_surface_${surface}_${control}_enabled`, control !== 'passkey');
      }
    }
    for (const provider of ['google', 'yandex', 'vk', 'apple'] as const) {
      fakes.publicValues.set(`oauth_${provider}_enabled`, true);
    }

    for (const surface of ['staff', 'platform_admin'] as const) {
      selectPolicySurface(surface);
      await expect(getAuthChannelPolicy()).resolves.toEqual({
        email: false,
        sms: false,
        telegram: false,
        max: false,
      });
      // Passkey остаётся дверью сотрудника и снят у платформенного администратора (С9
      // `docs/_TODO/STAFF_DOORS_HARDCODED_2026-09-16.md`): состав двери решает код, а не тумблер.
      await expect(isIndependentAuthMethodEnabled('passkey')).resolves.toBe(surface === 'staff');
      for (const provider of ['google', 'yandex', 'vk', 'apple'] as const) {
        await expect(isOAuthProviderEnabled(provider)).resolves.toBe(false);
      }
    }
  });

  it('keeps the patient door controlled by its persisted surface values', async () => {
    const patientValues = {
      email: true,
      sms: false,
      telegram: false,
      max: false,
      telegram_login_widget: false,
      oauth_google: false,
      oauth_yandex: false,
      oauth_vk: false,
      oauth_apple: false,
      passkey: true,
    } as const;

    for (const control of SURFACE_AUTH_CONTROLS) {
      fakes.publicValues.set(patientSurfaceAuthSettingKey(control), patientValues[control]);
    }
    for (const provider of ['google', 'yandex', 'vk', 'apple'] as const) {
      fakes.publicValues.set(`oauth_${provider}_enabled`, true);
    }

    selectPolicySurface('patient');
    await expect(getAuthChannelPolicy()).resolves.toEqual({
      email: true,
      sms: false,
      telegram: false,
      max: false,
    });
    await expect(isIndependentAuthMethodEnabled('passkey')).resolves.toBe(true);
    for (const provider of ['google', 'yandex', 'vk', 'apple'] as const) {
      await expect(isOAuthProviderEnabled(provider)).resolves.toBe(false);
    }
  });

  it('applies a changed patient toggle only to the patient door', async () => {
    for (const channel of ['email', 'sms', 'telegram', 'max'] as const) {
      fakes.publicValues.set(patientSurfaceAuthSettingKey(channel), true);
    }
    fakes.publicValues.set(patientSurfaceAuthSettingKey('email'), false);

    selectPolicySurface('staff');
    await expect(getAuthChannelPolicy()).resolves.toMatchObject({ email: false });
    selectPolicySurface('platform_admin');
    await expect(getAuthChannelPolicy()).resolves.toMatchObject({ email: false });
    selectPolicySurface('patient');
    await expect(getAuthChannelPolicy()).resolves.toMatchObject({ email: false });
  });

  it('fails closed when the trusted resolved-surface header is missing', async () => {
    fakes.resolvedSurfaceHeaderPresent.value = false;
    fakes.publicValues.set('auth_email_enabled', true);

    await expect(isAuthChannelEnabled('email')).resolves.toBe(false);
    expect(fakes.getPublicRuntimeBool).not.toHaveBeenCalled();
  });

  it('uses only boolean capabilities to hide an unconfigured channel from anonymous login', async () => {
    selectPolicySurface('patient');
    for (const channel of ['email', 'sms', 'telegram', 'max'] as const) {
      fakes.publicValues.set(patientSurfaceAuthSettingKey(channel), true);
    }
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

  it('hides a configured channel when its global admin toggle is disabled', async () => {
    selectPolicySurface('patient');
    for (const [control, value] of [
      ['email', true],
      ['sms', true],
      ['telegram', true],
      ['max', false],
    ] as const) {
      fakes.publicValues.set(patientSurfaceAuthSettingKey(control), value);
    }
    for (const channel of ['email', 'sms', 'telegram', 'max']) {
      fakes.configuredChannels.set(channel, true);
    }

    await expect(getAnonymousClientVisibleAuthChannelPolicy()).resolves.toEqual({
      email: true,
      sms: true,
      telegram: true,
      max: false,
    });
  });

  it.each([
    ['google', 'oauth_google', 'oauth_google_enabled'],
    ['yandex', 'oauth_yandex', 'oauth_yandex_enabled'],
    ['apple', 'oauth_apple', 'oauth_apple_enabled'],
    ['vk', 'oauth_vk', 'oauth_vk_enabled'],
  ] as const)(
    'uses the %s public configured projection as the OAuth availability answer',
    async (provider, toggleControl, configuredKey) => {
      selectPolicySurface('patient');
      fakes.publicValues.set(patientSurfaceAuthSettingKey(toggleControl), true);
      fakes.publicValues.set(configuredKey, false);

      await expect(isOAuthProviderEnabled(provider as OAuthProvider)).resolves.toBe(false);
    },
  );

  it('keeps credential-backed configured detail on the authenticated admin accessor', async () => {
    for (const channel of ['email', 'sms', 'telegram', 'max'] as const) {
      fakes.publicValues.set(patientSurfaceAuthSettingKey(channel), true);
    }

    await expect(getAuthChannelPolicyDetail('patient')).resolves.toEqual({
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
