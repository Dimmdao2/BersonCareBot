/** @vitest-environment jsdom */
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvidersSection, type AuthProvidersSectionProps } from './AuthProvidersSection';

const { patchAdminSettingMock } = vi.hoisted(() => ({
  patchAdminSettingMock: vi.fn(),
}));

vi.mock('./patchAdminSetting', () => ({
  patchAdminSetting: patchAdminSettingMock,
}));

const props: AuthProvidersSectionProps = {
  telegramLoginBotUsername: '',
  maxLoginBotNickname: '',
  maxBotApiKey: '',
  vkIdApplicationId: '12345',
  vkIdHasStoredClientSecret: true,
  vkIdRedirectUri: 'https://example.test/api/auth/oauth/callback/vk-id',
  yandexOauthClientId: '',
  yandexOauthClientSecret: '',
  yandexOauthRedirectUri: '',
  googleClientId: '',
  googleClientSecret: '',
  googleOauthLoginRedirectUri: '',
  googleCalendarRedirectUri: '',
  appleOauthClientId: '',
  appleOauthTeamId: '',
  appleOauthKeyId: '',
  appleOauthPrivateKey: '',
  appleOauthRedirectUri: '',
};

describe('AuthProvidersSection VK ID credentials', () => {
  beforeEach(() => {
    patchAdminSettingMock.mockReset().mockResolvedValue(true);
  });

  it('shows the required VK ID fields and never hydrates the protected key', () => {
    render(<AuthProvidersSection {...props} />);

    expect(screen.getByLabelText('ID приложения (client_id / APP_ID)')).toHaveValue('12345');
    expect(screen.getByPlaceholderText('Сохранён; оставьте пустым, чтобы не менять')).toHaveValue(
      '',
    );
    expect(
      screen.getByPlaceholderText('Сохранён; оставьте пустым, чтобы не менять'),
    ).toHaveAttribute('placeholder', 'Сохранён; оставьте пустым, чтобы не менять');
    expect(
      screen.getByPlaceholderText('https://example.com/api/auth/oauth/callback/vk-id'),
    ).toHaveValue('https://example.test/api/auth/oauth/callback/vk-id');
    expect(screen.getByText(/Сервисный ключ доступа VK API/)).toBeInTheDocument();
  });

  it('does not overwrite the stored protected key when its redacted field stays empty', async () => {
    render(<AuthProvidersSection {...props} />);
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() => expect(patchAdminSettingMock).toHaveBeenCalled());
    expect(patchAdminSettingMock).toHaveBeenCalledWith('vk_id_application_id', '12345');
    expect(patchAdminSettingMock).toHaveBeenCalledWith(
      'vk_id_redirect_uri',
      'https://example.test/api/auth/oauth/callback/vk-id',
    );
    expect(patchAdminSettingMock).not.toHaveBeenCalledWith(
      'vk_id_client_secret',
      expect.anything(),
    );
  });

  it('sends a newly entered protected key once and clears the browser field after success', async () => {
    render(<AuthProvidersSection {...props} />);
    const protectedKey = screen.getByPlaceholderText('Сохранён; оставьте пустым, чтобы не менять');
    await userEvent.type(protectedKey, 'new-configured-marker');
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить' }));

    await waitFor(() =>
      expect(patchAdminSettingMock).toHaveBeenCalledWith(
        'vk_id_client_secret',
        'new-configured-marker',
      ),
    );
    await waitFor(() => expect(protectedKey).toHaveValue(''));
  });
});
