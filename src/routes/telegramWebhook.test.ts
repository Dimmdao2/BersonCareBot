// src/routes/telegramWebhook.test.ts
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';

import type { TelegramWebhookBody } from '../types/telegram.js';

// ---- node-fetch mock (используется внутри telegramWebhook.ts)
type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

const fetchMock = vi.fn();

vi.mock('node-fetch', () => {
  return { default: (..._args: unknown[]) => fetchMock() };
});

// ВАЖНО:
// env парсится в config/env.ts при импорте.
// Поэтому для тестов, которые меняют process.env, надо:
// 1) выставить process.env
// 2) vi.resetModules()
// 3) импортировать telegramWebhookRoutes динамически
async function buildAppWithEnv(envPatch: Record<string, string | undefined>) {
  // применяем патч к process.env (включая удаление)
  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }

  // сбрасываем кеш модулей, чтобы env пересобрался заново
  vi.resetModules();

  // динамический импорт после resetModules
  const mod = (await import('./telegramWebhook.js')) as typeof import('./telegramWebhook.js');

  const app = Fastify({ logger: false });
  await mod.telegramWebhookRoutes(app);
  await app.ready();
  return app;
}

beforeEach(() => {
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    json: async () => ({}),
  } satisfies FetchResponse);
});

const hasRealDb =
  process.env.DATABASE_URL != null && !process.env.DATABASE_URL.includes('localhost:5432/test');

describe('POST /webhook/telegram', () => {
  it.skipIf(!hasRealDb)('deduplicates repeated update_id (persistent)', async () => {
    // Сбросить last_update_id для telegram_id=1 (если тестовая БД доступна)
    try {
      const { db } = await import('../db/client.js');
      await db.query('UPDATE telegram_users SET last_update_id = NULL WHERE telegram_id = $1', [1]);
    } catch (e) {
      // ignore if db not available
    }
    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: undefined });

    // 1) первый апдейт: /start гарантированно триггерит sendMessage => fetchMock
    const body = {
      update_id: 777,
      message: {
        message_id: 1,
        chat: { id: 1 },
        from: { id: 1, is_bot: false, first_name: 'A' },
        text: '/start',
      },
    } satisfies TelegramWebhookBody;

    const res1 = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });

    expect(res1.statusCode).toBe(200);
    expect(res1.json()).toEqual({ ok: true });

    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    // 2) тот же update_id повторно — должен быть дедуп и не должно быть новых tgCall
    const res2 = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });

    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ ok: true });

    const callsAfterSecond = fetchMock.mock.calls.length;
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });
  it('returns 200 if no secret set', async () => {
    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: undefined });

    const body = {
      update_id: 1,
      message: {
        message_id: 1,
        chat: { id: 1 },
        from: { id: 1, is_bot: false, first_name: 'A' },
        text: '/start',
      },
    } satisfies TelegramWebhookBody;

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 200 with correct secret', async () => {
    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: 'secret' });

    const body = {
      update_id: 2,
      message: {
        message_id: 2,
        chat: { id: 1 },
        from: { id: 1, is_bot: false, first_name: 'A' },
        text: '/start',
      },
    } satisfies TelegramWebhookBody;

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'secret' },
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });

  it('returns 403 with wrong secret', async () => {
    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: 'secret' });

    const body = {
      update_id: 3,
      message: {
        message_id: 3,
        chat: { id: 1 },
        from: { id: 1, is_bot: false, first_name: 'A' },
        text: '/start',
      },
    } satisfies TelegramWebhookBody;

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'x-telegram-bot-api-secret-token': 'wrong' },
      payload: body,
    });

    expect(res.statusCode).toBe(403);
    expect(res.json()).toEqual({ ok: false });
  });

  it('tgCall failure must not break webhook (still 200)', async () => {
    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 400,
      json: async () => ({ description: 'Bad Request: chat not found' }),
    } satisfies FetchResponse);

    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: undefined });

    const body = {
      update_id: 4,
      message: {
        message_id: 4,
        chat: { id: 999999999 },
        from: {
          id: 364943522,
          is_bot: false,
          first_name: 'Дмитрий',
          last_name: 'Берсон',
          username: 'dimmdao',
        },
        text: '/start',
      },
    } satisfies TelegramWebhookBody;

    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
