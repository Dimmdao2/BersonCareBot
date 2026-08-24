import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvidersSection } from './AuthProvidersSection';

const patchAdminSetting = vi.fn().mockResolvedValue(true);

vi.mock('./patchAdminSetting', () => ({
  patchAdminSetting: (...args: unknown[]) => patchAdminSetting(...args),
  patchAdminSettingWithResult: (...args: unknown[]) =>
    patchAdminSetting(...args).then(() => ({ ok: true })),
}));

const baseProps = {
  telegramLoginBotUsername: '',
  maxLoginBotNickname: '',
  maxBotApiKey: '',
  vkIdApplicationId: '',
  vkIdHasStoredClientSecret: false,
  vkIdRedirectUri: '',
  yandexOauthClientId: 'client-id',
  yandexOauthClientSecret: 'client-secret',
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

afterEach(() => {
  cleanup();
  patchAdminSetting.mockClear();
});

/**
 * `C2`: сверка callback-адреса точная, а брендированных пациентских доменов много.
 * Если форма умеет писать только одну строку, живым остаётся ровно один домен, а на
 * остальных вход по Yandex молча отвечает `oauth_disabled`.
 */
describe('AuthProvidersSection: Yandex callback allowlist is a list, not a single field', () => {
  const saveWith = async (value: string, initial = '') => {
    render(<AuthProvidersSection {...baseProps} yandexOauthRedirectUri={initial} />);
    const field = screen.getByPlaceholderText('https://example.com/api/auth/oauth/callback/yandex');
    fireEvent.change(field, { target: { value } });
    fireEvent.click(screen.getAllByRole('button', { name: /Сохранить/i })[0]!);
    await waitFor(() => expect(patchAdminSetting).toHaveBeenCalled());
    return patchAdminSetting.mock.calls.find(
      (call) => call[0] === 'yandex_oauth_redirect_uri',
    )?.[1];
  };

  it('saves every entered origin, not just the first one', async () => {
    const saved = await saveWith(
      'https://therapygo.ru/api/auth/oauth/callback/yandex\nhttps://clinic.example.com/api/auth/oauth/callback/yandex',
    );
    expect(saved).toEqual([
      'https://therapygo.ru/api/auth/oauth/callback/yandex',
      'https://clinic.example.com/api/auth/oauth/callback/yandex',
    ]);
  });

  it('still accepts a single address and saves it as a one-entry list', async () => {
    const saved = await saveWith('https://therapygo.ru/api/auth/oauth/callback/yandex');
    expect(saved).toEqual(['https://therapygo.ru/api/auth/oauth/callback/yandex']);
  });

  it('refuses a list where any entry is not an http(s) URL', async () => {
    render(<AuthProvidersSection {...baseProps} yandexOauthRedirectUri="" />);
    const field = screen.getByPlaceholderText('https://example.com/api/auth/oauth/callback/yandex');
    fireEvent.change(field, {
      target: { value: 'https://therapygo.ru/api/auth/oauth/callback/yandex\nне-адрес' },
    });
    fireEvent.click(screen.getAllByRole('button', { name: /Сохранить/i })[0]!);
    await waitFor(() =>
      expect(screen.getByText(/Yandex redirect URI/)).toBeTruthy(),
    );
    expect(
      patchAdminSetting.mock.calls.some((call) => call[0] === 'yandex_oauth_redirect_uri'),
    ).toBe(false);
  });
});
