import { beforeEach, describe, expect, it, vi } from 'vitest';

const fakes = vi.hoisted(() => ({
  gate: vi.fn(),
  listSettingsByScope: vi.fn(),
  updateSetting: vi.fn(),
  getAuthChannelPolicyDetail: vi.fn(),
  getOAuthProviderPolicyDetail: vi.fn(),
}));

vi.mock('@/app-layer/guards/requireRole', () => ({
  requirePlatformOperationsApiContext: fakes.gate,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({
    systemSettings: {
      listSettingsByScope: fakes.listSettingsByScope,
      updateSetting: fakes.updateSetting,
    },
  }),
}));
vi.mock('@/modules/auth/authChannelPolicyAdmin', () => ({
  getAuthChannelPolicyDetail: fakes.getAuthChannelPolicyDetail,
}));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  getOAuthProviderPolicyDetail: fakes.getOAuthProviderPolicyDetail,
}));

import { GET, PATCH } from './route';

const session = {
  user: {
    userId: '00000000-0000-4000-8000-000000000017',
    role: 'admin',
    displayName: 'Platform admin',
    bindings: {},
  },
};

function setting(
  key:
    | 'telegram_bot_token'
    | 'telegram_webhook_secret'
    | 'telegram_mode'
    | 'vk_community_access_token'
    | 'vk_callback_secret'
    | 'vk_callback_confirmation_token',
  value: string,
) {
  return {
    key,
    scope: 'admin' as const,
    organizationId: null,
    valueJson: { value },
    updatedAt: '2026-08-20T00:00:00.000Z',
    updatedBy: session.user.userId,
  };
}

function patch(body: unknown) {
  return PATCH(
    new Request('https://app.example.test/api/platform/settings', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    }),
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.gate.mockResolvedValue({ ok: true, session });
  fakes.listSettingsByScope.mockResolvedValue([]);
  fakes.getAuthChannelPolicyDetail.mockResolvedValue({});
  fakes.getOAuthProviderPolicyDetail.mockResolvedValue({});
});

describe('/api/platform/settings Telegram credentials', () => {
  it('returns only configured state, never either stored Telegram secret', async () => {
    const token = 'telegram-token-must-not-reach-client';
    const webhookSecret = 'telegram-webhook-secret-must-not-reach-client';
    fakes.listSettingsByScope.mockResolvedValue([
      setting('telegram_bot_token', token),
      setting('telegram_webhook_secret', webhookSecret),
    ]);

    const response = await GET();
    const bodyText = await response.text();

    expect(response.status).toBe(200);
    expect(bodyText).not.toContain(token);
    expect(bodyText).not.toContain(webhookSecret);
    expect(JSON.parse(bodyText)).toMatchObject({
      ok: true,
      settings: [
        { key: 'telegram_bot_token', valueJson: { value: { configured: true } } },
        { key: 'telegram_webhook_secret', valueJson: { value: { configured: true } } },
      ],
    });
  });

  it('accepts Telegram settings and still rejects an unknown key', async () => {
    const token = 'new-telegram-token';
    const webhookSecret = 'new-telegram-webhook-secret';
    const telegramMode = 'long_polling';
    fakes.updateSetting
      .mockResolvedValueOnce(setting('telegram_bot_token', token))
      .mockResolvedValueOnce(setting('telegram_webhook_secret', webhookSecret))
      .mockResolvedValueOnce(setting('telegram_mode', telegramMode));

    const tokenResponse = await patch({ key: 'telegram_bot_token', value: ` ${token} ` });
    const webhookResponse = await patch({ key: 'telegram_webhook_secret', value: webhookSecret });
    const modeResponse = await patch({ key: 'telegram_mode', value: telegramMode });
    const unknownResponse = await patch({ key: 'not_a_platform_setting', value: true });

    expect(tokenResponse.status).toBe(200);
    expect(webhookResponse.status).toBe(200);
    expect(modeResponse.status).toBe(200);
    expect(await tokenResponse.text()).not.toContain(token);
    expect(await webhookResponse.text()).not.toContain(webhookSecret);
    expect(fakes.updateSetting).toHaveBeenNthCalledWith(
      1,
      'telegram_bot_token',
      'admin',
      { value: token },
      session.user.userId,
      { organizationId: null },
    );
    expect(fakes.updateSetting).toHaveBeenNthCalledWith(
      3,
      'telegram_mode',
      'admin',
      { value: telegramMode },
      session.user.userId,
      { organizationId: null },
    );
    expect(fakes.updateSetting).toHaveBeenNthCalledWith(
      2,
      'telegram_webhook_secret',
      'admin',
      { value: webhookSecret },
      session.user.userId,
      { organizationId: null },
    );
    expect(unknownResponse.status).toBe(400);
    await expect(unknownResponse.json()).resolves.toEqual({ ok: false, error: 'invalid_body' });
    expect(fakes.updateSetting).toHaveBeenCalledTimes(3);
  });

  it('returns and accepts VK credentials without exposing their values', async () => {
    const values = {
      vk_community_access_token: 'vk-community-token-must-not-reach-client',
      vk_callback_secret: 'vk-callback-secret-must-not-reach-client',
      vk_callback_confirmation_token: 'vk-confirmation-token-must-not-reach-client',
    } as const;
    fakes.listSettingsByScope.mockResolvedValue(
      Object.entries(values).map(([key, value]) => setting(key as keyof typeof values, value)),
    );

    const getResponse = await GET();
    const bodyText = await getResponse.text();
    for (const value of Object.values(values)) expect(bodyText).not.toContain(value);
    expect(JSON.parse(bodyText)).toMatchObject({
      settings: [
        { key: 'vk_community_access_token', valueJson: { value: { configured: true } } },
        { key: 'vk_callback_secret', valueJson: { value: { configured: true } } },
        { key: 'vk_callback_confirmation_token', valueJson: { value: { configured: true } } },
      ],
    });

    fakes.updateSetting.mockReset();
    fakes.updateSetting
      .mockResolvedValueOnce(setting('vk_community_access_token', values.vk_community_access_token))
      .mockResolvedValueOnce(setting('vk_callback_secret', values.vk_callback_secret))
      .mockResolvedValueOnce(setting('vk_callback_confirmation_token', values.vk_callback_confirmation_token));
    for (const [key, value] of Object.entries(values)) {
      const response = await patch({ key, value: ` ${value} ` });
      expect(response.status).toBe(200);
      expect(await response.text()).not.toContain(value);
    }
    expect(fakes.updateSetting).toHaveBeenCalledTimes(3);
  });

  it('does not report or enable VK availability without usable platform credentials', async () => {
    const availability = {
      version: 1,
      integrations: {
        telegram: true,
        max: true,
        vk: true,
        email: true,
        smsc: true,
        web_push: true,
        google_calendar: true,
        yandex_calendar: false,
      },
    };
    fakes.listSettingsByScope.mockResolvedValue([
      {
        key: 'platform_integration_availability',
        scope: 'admin' as const,
        organizationId: null,
        valueJson: { value: availability },
        updatedAt: '2026-08-20T00:00:00.000Z',
        updatedBy: null,
      },
    ]);

    const getBody = await (await GET()).json();
    expect(getBody).toMatchObject({
      settings: [{ key: 'platform_integration_availability', valueJson: { value: { integrations: { vk: false } } } }],
    });

    const patchResponse = await patch({ key: 'platform_integration_availability', value: availability });
    expect(patchResponse.status).toBe(400);
    await expect(patchResponse.json()).resolves.toEqual({
      ok: false,
      error: 'vk_platform_credentials_required',
    });
    expect(fakes.updateSetting).not.toHaveBeenCalled();
  });
});
