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
  isOAuthProviderEnabled,
  type OAuthProvider,
} from './authChannelPolicy';
import { getAuthChannelPolicyDetail } from './authChannelPolicyAdmin';
import { patientSurfaceAuthSettingKey } from './surfaceAuthSettings';
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
