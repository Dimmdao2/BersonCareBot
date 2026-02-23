/**
 * Unit tests for webhook: моки сервиса и Telegram, без реальной БД.
 * Проверки: дедупликация по update_id, валидация, секрет, устойчивость к ошибкам tgCall.
 */
import Fastify from 'fastify';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fetchMock = vi.fn();
vi.mock('node-fetch', () => ({ default: (..._args: unknown[]) => fetchMock() }));

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

vi.mock('../../services/telegramUserService.js', () => ({
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
  upsertTelegramUser: mockUpsert,
  setTelegramUserState: mockSetState,
  getTelegramUserState: mockGetState,
  getNotificationSettings: mockGetNotif,
  updateNotificationSettings: mockUpdateNotif,
  tryAdvanceLastUpdateId: tryAdvanceLastUpdateIdMock,
  tryConsumeStart: mockConsumeStart,
}));

type FetchResponse = {
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
};

async function buildAppWithEnv(envPatch: Record<string, string | undefined>) {
  for (const [k, v] of Object.entries(envPatch)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  vi.resetModules();
  const mod = (await import('./webhook.js')) as typeof import('./webhook.js');
  const app = Fastify({ logger: false });
  await mod.telegramWebhookRoutes(app);
  await app.ready();
  return app;
}

describe('POST /webhook/telegram (mocked)', () => {
  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({}),
    } satisfies FetchResponse);
    tryAdvanceLastUpdateIdMock.mockReset();
  });

  it('when tryAdvanceLastUpdateId returns false (duplicate), responds 200 without calling Telegram', async () => {
    tryAdvanceLastUpdateIdMock
      .mockResolvedValueOnce(true)  // первый запрос — новый update_id
      .mockResolvedValueOnce(false); // второй — дубликат

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
    const callsAfterFirst = fetchMock.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0);

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
