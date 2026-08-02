import { beforeEach, expect, it, vi } from 'vitest';

const listSettingsByScope = vi.fn();

vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ systemSettings: { listSettingsByScope } }),
}));

const { loadAdminSettingsPageData, loadAuthProvidersConfig } = await import('./adminSettingsData');

beforeEach(() => {
  listSettingsByScope.mockReset().mockResolvedValue([]);
});

it('refuses the settings page when required database rows are missing', async () => {
  await expect(loadAdminSettingsPageData()).rejects.toThrow('runtime_setting_unavailable');
});

it('loads the auth form when unrelated technical settings are missing', async () => {
  listSettingsByScope.mockResolvedValue([
    {
      key: 'telegram_login_bot_username',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: '  login_bot  ' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: null,
    },
  ]);

  await expect(loadAuthProvidersConfig()).resolves.toMatchObject({
    telegramLoginBotUsername: 'login_bot',
    googleClientId: '',
    appleOauthClientId: '',
  });
});

it('treats missing auth configuration as an unconfigured form', async () => {
  await expect(loadAuthProvidersConfig()).resolves.toMatchObject({
    telegramLoginBotUsername: '',
    maxLoginBotNickname: '',
    googleClientId: '',
    appleOauthClientId: '',
  });
});

it('does not pass a stored provider secret to the auth form', async () => {
  listSettingsByScope.mockResolvedValue([
    {
      key: 'yandex_oauth_client_secret',
      scope: 'admin',
      organizationId: null,
      valueJson: { value: 'raw-provider-secret' },
      updatedAt: '2026-08-02T00:00:00.000Z',
      updatedBy: null,
    },
  ]);

  await expect(loadAuthProvidersConfig()).resolves.toMatchObject({
    yandexOauthClientSecret: '[REDACTED]',
  });
});
