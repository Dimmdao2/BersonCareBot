/**
 * Unit tests for webhook: моки deps и Telegram (grammy использует global fetch), без реальной БД.
 */
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const telegramFetchMock = vi.fn().mockImplementation(() =>
  Promise.resolve(
    new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  ),
);
const originalFetch = globalThis.fetch;
globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
  if (String(url).includes('api.telegram.org')) return telegramFetchMock(input, init);
  return originalFetch(input, init);
};

const tryAdvanceLastUpdateIdMock = vi.fn();
const mockUpsert = vi.fn().mockResolvedValue({ id: '1', telegram_id: '1' });
const mockSetState = vi.fn().mockResolvedValue(undefined);
const mockGetState = vi.fn().mockResolvedValue('idle');
const mockGetNotif = vi.fn().mockResolvedValue({
  notify_spb: false,
  notify_msk: false,
  notify_online: false,
});
const mockUpdateNotif = vi.fn().mockResolvedValue(undefined);
const mockConsumeStart = vi.fn().mockResolvedValue(true);

const mockWebhookDeps = {
  userPort: {
    upsertTelegramUser: mockUpsert,
    setTelegramUserState: mockSetState,
    getTelegramUserState: mockGetState,
    tryAdvanceLastUpdateId: tryAdvanceLastUpdateIdMock,
    tryConsumeStart: mockConsumeStart,
  },
  notificationsPort: {
    getNotificationSettings: mockGetNotif,
    updateNotificationSettings: mockUpdateNotif,
  },
};

async function buildAppWithEnv(envPatch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const mod = (await import('./webhook.js')) as typeof import('./webhook.js');
  const app = Fastify({ logger: false });
  await mod.telegramWebhookRoutes(app, mockWebhookDeps);
  await app.ready();
  return app;
}

describe('POST /webhook/telegram (mocked)', () => {
  beforeEach(() => {
    telegramFetchMock.mockClear();
    tryAdvanceLastUpdateIdMock.mockReset();
  });

  it('when tryAdvanceLastUpdateId returns false (duplicate), responds 200 without calling Telegram', async () => {
    tryAdvanceLastUpdateIdMock
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: undefined });
    const body = {
      update_id: 777,
      message: {
        message_id: 1,
        chat: { id: 1 },
        from: { id: 1, is_bot: false, first_name: 'A' },
        text: '/start',
      },
    };

    const res1 = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });
    expect(res1.statusCode).toBe(200);
    const callsAfterFirst = telegramFetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

    const res2 = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: body,
    });
    expect(res2.statusCode).toBe(200);
    expect(res2.json()).toEqual({ ok: true });
    const callsAfterSecond = telegramFetchMock.mock.calls.length;
    expect(callsAfterSecond).toBe(callsAfterFirst);
  });

  it('returns 400 when body is valid JSON but fails schema (e.g. update_id string)', async () => {
    const app = await buildAppWithEnv({ TG_WEBHOOK_SECRET: undefined });
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      payload: { update_id: 'not-a-number', message: { from: { id: 1 }, chat: { id: 1 }, text: '/start' } },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ ok: false, error: 'Invalid webhook body' });
  });
});
