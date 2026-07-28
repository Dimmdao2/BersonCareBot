import { beforeEach, describe, expect, it, vi } from 'vitest';

const { getPublicRuntimeBoolMock, getPublicRuntimeValueMock, getConfigValueMock } = vi.hoisted(
  () => ({
    getPublicRuntimeBoolMock: vi.fn(),
    getPublicRuntimeValueMock: vi.fn(),
    getConfigValueMock: vi.fn(),
  }),
);
const integrationRuntimeMocks = vi.hoisted(() => ({
  getTelegramBotToken: vi.fn(),
  getMaxBotApiKey: vi.fn(),
}));

vi.mock('@/modules/system-settings/configAdapter', () => ({
  getPublicRuntimeBool: (key: string) => getPublicRuntimeBoolMock(key),
  getPublicRuntimeValue: (key: string) => getPublicRuntimeValueMock(key),
  getConfigValue: (key: string, fallback: string) => getConfigValueMock(key, fallback),
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => integrationRuntimeMocks);

import { getLoginAlternativesPublicConfig } from './loginAlternativesConfig';

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

describe('getLoginAlternativesPublicConfig', () => {
  beforeEach(() => {
    getPublicRuntimeBoolMock.mockReset();
    getPublicRuntimeValueMock.mockReset();
    getPublicRuntimeBoolMock.mockResolvedValue(true);
    getPublicRuntimeValueMock.mockImplementation(async (key: string) => {
      if (key === 'max_login_bot_nickname') return 'my_public_bot';
      if (key === 'vk_web_login_url') return 'https://vk.com/example';
      return '';
    });
    getConfigValueMock.mockReset().mockImplementation(async (key: string) => {
      if (key === 'smtp_outbound') return SMTP_CONFIGURED_JSON;
      if (key === 'smsc_api_key') return 'sms-key';
      return '';
    });
    integrationRuntimeMocks.getTelegramBotToken.mockReset().mockResolvedValue('bot-token');
    integrationRuntimeMocks.getMaxBotApiKey.mockReset().mockResolvedValue('max-key');
  });

  it('uses safe projections and does not expose Telegram Login', async () => {
    const cfg = await getLoginAlternativesPublicConfig();

    expect(cfg).toEqual({
      telegramBotUsername: null,
      maxBotOpenUrl: 'https://max.ru/my_public_bot',
      vkWebLoginUrl: 'https://vk.com/example',
      smsFallbackEnabled: true,
      authChannelPolicy: { email: true, sms: true, telegram: true, max: true },
    });
    expect(getPublicRuntimeBoolMock).toHaveBeenCalledWith('public_sms_fallback_enabled');
  });

  it('hides a channel that is toggled on but unconfigured (owner ruling 2026-07-24)', async () => {
    integrationRuntimeMocks.getMaxBotApiKey.mockResolvedValue('');
    const cfg = await getLoginAlternativesPublicConfig();
    expect(cfg.authChannelPolicy).toEqual({ email: true, sms: true, telegram: true, max: false });
  });
});
