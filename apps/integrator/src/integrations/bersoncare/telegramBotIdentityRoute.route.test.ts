import { createHmac } from 'node:crypto';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { registerBersoncareTelegramBotIdentityRoute } from './telegramBotIdentityRoute.js';

const SHARED_SECRET = 'telegram-bot-identity-route-test-secret';
const ROUTE = '/api/bersoncare/telegram-bot-identity';
const ORGANIZATION_ID = '11111111-1111-4111-8111-111111111111';
const apps: FastifyInstance[] = [];

const fakes = vi.hoisted(() => ({
  fetchTelegramBotIdentity: vi.fn(),
  getTelegramRuntimeConfig: vi.fn(),
  getTelegramLoginWidgetBotToken: vi.fn(),
  loggerWarn: vi.fn(),
}));

vi.mock('../telegram/client.js', () => ({
  fetchTelegramBotIdentity: fakes.fetchTelegramBotIdentity,
}));
vi.mock('../../infra/adapters/integrationRuntimeConfig.js', () => ({
  getTelegramRuntimeConfig: fakes.getTelegramRuntimeConfig,
  getTelegramLoginWidgetBotToken: fakes.getTelegramLoginWidgetBotToken,
}));
vi.mock('../../infra/principal/organizationPrincipal.js', () => ({
  runWithOptionalOrganizationPrincipal: async (_id: string, fn: () => Promise<unknown>) => fn(),
}));
vi.mock('../../infra/observability/logger.js', () => ({
  logger: { warn: fakes.loggerWarn },
}));

function signedHeaders(rawBody: string): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': createHmac('sha256', SHARED_SECRET)
      .update(`${timestamp}.${rawBody}`)
      .digest('base64url'),
  };
}

async function buildApp(resolveClinicDeliveryCredential = vi.fn(async () => null)) {
  const app = Fastify({ logger: false });
  apps.push(app);
  await registerBersoncareTelegramBotIdentityRoute(app, {
    sharedSecret: SHARED_SECRET,
    resolveClinicDeliveryCredential: resolveClinicDeliveryCredential as unknown as Parameters<
      typeof registerBersoncareTelegramBotIdentityRoute
    >[1]['resolveClinicDeliveryCredential'],
  });
  return app;
}

async function inject(app: FastifyInstance, payload: unknown, headers?: Record<string, string>) {
  const rawBody = JSON.stringify(payload);
  return app.inject({
    method: 'POST',
    url: ROUTE,
    headers: headers ?? signedHeaders(rawBody),
    payload: rawBody,
  });
}

afterEach(async () => {
  vi.clearAllMocks();
  await Promise.all(apps.splice(0).map((app) => app.close()));
});

/**
 * Дверь существует ради одного факта: имя бота принадлежит токену. Владелец 16.09.2026 получил в
 * проде чужого бота, потому что имя вводили руками отдельно от токена. Токен при этом остаётся
 * здесь: webapp присылает только адресацию.
 */
describe('POST /api/bersoncare/telegram-bot-identity', () => {
  it('отвечает именем платформенного пациентского бота', async () => {
    fakes.getTelegramRuntimeConfig.mockResolvedValue({ enabled: true, botToken: '123:AAsecret' });
    fakes.fetchTelegramBotIdentity.mockResolvedValue({
      ok: true,
      username: 'bersoncare_bot',
      botId: 42,
    });
    const app = await buildApp();

    const response = await inject(app, { scope: 'platform', audience: 'patient' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true, username: 'bersoncare_bot', botId: 42 });
    expect(fakes.getTelegramRuntimeConfig).toHaveBeenCalledWith('patient');
    expect(fakes.fetchTelegramBotIdentity).toHaveBeenCalledWith('123:AAsecret');
  });

  /**
   * Бот Login Widget — ТРЕТЬЯ личность: свой токен, свой домен в @BotFather, доставкой не занят.
   * Аудит 16.09.2026 показал, чем платит смешение: имя виджета принималось при любом сохранённом
   * токене, и кнопка бота A проверялась подписью бота B — вход отказывал всегда.
   */
  it('спрашивает имя бота виджета по ЕГО токену, а не по токену доставки', async () => {
    fakes.getTelegramLoginWidgetBotToken.mockResolvedValue('widget:AAsecret');
    fakes.fetchTelegramBotIdentity.mockResolvedValue({
      ok: true,
      username: 'bersoncare_login_bot',
      botId: 76,
    });
    const app = await buildApp();

    const response = await inject(app, { scope: 'platform_login_widget' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, username: 'bersoncare_login_bot' });
    expect(fakes.fetchTelegramBotIdentity).toHaveBeenCalledWith('widget:AAsecret');
    expect(fakes.getTelegramRuntimeConfig).not.toHaveBeenCalled();
  });

  it('берёт токен клиники тем же резолвером, что и доставка, ещё до живой проверки канала', async () => {
    const resolve = vi.fn(async () => ({ channel: 'telegram', botToken: 'clinic:AAsecret' }));
    fakes.fetchTelegramBotIdentity.mockResolvedValue({
      ok: true,
      username: 'clinic_bot',
      botId: 7,
    });
    const app = await buildApp(resolve as never);

    const response = await inject(app, { scope: 'clinic', organizationId: ORGANIZATION_ID });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({ ok: true, username: 'clinic_bot' });
    expect(resolve).toHaveBeenCalledWith('telegram', { allowUnverified: true });
  });

  it('без токена отвечает причиной, а не выдумывает имя', async () => {
    fakes.getTelegramRuntimeConfig.mockResolvedValue({ enabled: false, botToken: '' });
    const app = await buildApp();

    const response = await inject(app, { scope: 'platform', audience: 'patient' });

    expect(response.json()).toEqual({ ok: false, error: 'credential_missing' });
    expect(fakes.fetchTelegramBotIdentity).not.toHaveBeenCalled();
  });

  it('отдаёт классифицированную причину отказа Telegram', async () => {
    const rejectedToken = '123:AAwrong-do-not-leak';
    fakes.getTelegramRuntimeConfig.mockResolvedValue({ enabled: true, botToken: rejectedToken });
    fakes.fetchTelegramBotIdentity.mockResolvedValue({ ok: false, error: 'telegram_rejected' });
    const app = await buildApp();

    const response = await inject(app, { scope: 'platform', audience: 'patient' });

    const responseBody = response.json();
    expect(responseBody).toEqual({ ok: false, error: 'telegram_rejected' });
    expect(JSON.stringify(responseBody)).not.toContain(rejectedToken);
    expect(JSON.stringify(fakes.loggerWarn.mock.calls)).not.toContain(rejectedToken);
  });

  it('без верной подписи не спрашивает ничего', async () => {
    const app = await buildApp();
    const rawBody = JSON.stringify({ scope: 'platform', audience: 'patient' });

    const response = await inject(app, JSON.parse(rawBody), {
      'content-type': 'application/json',
      'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
      'x-bersoncare-signature': 'not-a-signature',
    });

    expect(response.statusCode).toBe(401);
    expect(fakes.getTelegramRuntimeConfig).not.toHaveBeenCalled();
  });
});
