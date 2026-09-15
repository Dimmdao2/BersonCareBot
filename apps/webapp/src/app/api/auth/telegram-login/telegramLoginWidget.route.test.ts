import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Login Widget и «код в боте» — РАЗНЫЕ способы входа. Владелец 16.09.2026: «одно дело — логин
 * виджет, другое — подтверждение номера в телеграм», «Login Widget указывается отдельно… и только
 * если телеграм оаус админ включил на платформе», «и выключатели у платформы отдельные».
 *
 * Тест держит именно это разделение: у виджета свой переключатель, свой бот и свой токен, а
 * включённый канал «код в боте» его не открывает.
 */
const fakes = vi.hoisted(() => ({
  isTelegramLoginWidgetEnabled: vi.fn<() => Promise<boolean>>(),
  getTelegramLoginWidgetBotUsername: vi.fn<() => Promise<string>>(),
  getTelegramLoginWidgetBotToken: vi.fn<() => Promise<string>>(),
  getTelegramBotToken: vi.fn<() => Promise<string>>(),
  exchangeTelegramLoginWidget: vi.fn(),
  verifySignature: vi.fn(),
}));

vi.mock('@/app-layer/principal/bootstrapPrincipal', () => ({ stampBootstrapPrincipal: vi.fn() }));
vi.mock('@/modules/auth/authRouteObservability', () => ({ logAuthRouteTiming: vi.fn() }));
vi.mock('@/modules/auth/authChannelPolicy', () => ({
  isTelegramLoginWidgetEnabled: fakes.isTelegramLoginWidgetEnabled,
  getTelegramLoginWidgetBotUsername: fakes.getTelegramLoginWidgetBotUsername,
}));
vi.mock('@/modules/system-settings/integrationRuntime', () => ({
  getTelegramLoginWidgetBotToken: fakes.getTelegramLoginWidgetBotToken,
  getTelegramBotToken: fakes.getTelegramBotToken,
}));
vi.mock('@/modules/auth/telegramLoginVerify', () => ({
  verifyTelegramLoginWidgetSignature: fakes.verifySignature,
}));
vi.mock('@/app-layer/di/buildAppDeps', () => ({
  buildAppDeps: () => ({ auth: { exchangeTelegramLoginWidget: fakes.exchangeTelegramLoginWidget } }),
}));

import { GET as widgetConfig } from './config/route';
import { POST as widgetLogin } from './route';

function configRequest(): Request {
  return new Request('https://app.example.test/api/auth/telegram-login/config');
}

function loginRequest(body: object): Request {
  return new Request('https://app.example.test/api/auth/telegram-login', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fakes.isTelegramLoginWidgetEnabled.mockResolvedValue(true);
  fakes.getTelegramLoginWidgetBotUsername.mockResolvedValue('bersoncare_login_bot');
  fakes.getTelegramLoginWidgetBotToken.mockResolvedValue('widget:AAsecret');
  fakes.getTelegramBotToken.mockResolvedValue('delivery:AAsecret');
  fakes.verifySignature.mockReturnValue({ ok: false, reason: 'invalid' });
  fakes.exchangeTelegramLoginWidget.mockResolvedValue(null);
});

describe('Telegram Login Widget — отдельная дверь', () => {
  it('отдаёт имя СВОЕГО бота, а не бота, который шлёт коды', async () => {
    const response = await widgetConfig(configRequest());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      botUsername: 'bersoncare_login_bot',
    });
  });

  it('при выключенном переключателе виджета кнопки нет', async () => {
    fakes.isTelegramLoginWidgetEnabled.mockResolvedValue(false);

    const response = await widgetConfig(configRequest());

    await expect(response.json()).resolves.toEqual({ ok: true, botUsername: null });
    expect(fakes.getTelegramLoginWidgetBotUsername).not.toHaveBeenCalled();
  });

  it('вход по виджету отказывает, пока его переключатель выключен', async () => {
    fakes.isTelegramLoginWidgetEnabled.mockResolvedValue(false);

    const response = await widgetLogin(loginRequest({ id: '1', hash: 'h' }));

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toMatchObject({ error: 'auth_channel_disabled' });
    expect(fakes.exchangeTelegramLoginWidget).not.toHaveBeenCalled();
  });

  it('без токена бота виджета вход не притворяется рабочим', async () => {
    fakes.getTelegramLoginWidgetBotToken.mockResolvedValue('');

    const response = await widgetLogin(loginRequest({ id: '1', hash: 'h' }));

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({ error: 'telegram_not_configured' });
  });

  it('подпись сверяется токеном бота виджета, а не бота доставки', async () => {
    await widgetLogin(loginRequest({ id: '1', hash: 'h' }));

    expect(fakes.verifySignature).toHaveBeenCalledWith(expect.anything(), 'widget:AAsecret');
    expect(fakes.getTelegramBotToken).not.toHaveBeenCalled();
  });
});
