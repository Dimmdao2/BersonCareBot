import Fastify from 'fastify';
import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { describe, it, expect, beforeEach, vi } from 'vitest';

const fixturesDir = fileURLToPath(new URL('../../../e2e/fixtures/telegram', import.meta.url));

const recordedCalls: { method: string; body: unknown }[] = [];
const telegramFetchMock = vi.fn().mockImplementation((input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
  const path = new URL(url).pathname;
  const method = path.replace(/^\/bot[^/]+\//, '') || 'unknown';
  let body: unknown = init?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      // ignore non-json bodies in tests
    }
  }
  recordedCalls.push({ method, body });
  return Promise.resolve(
    new Response(JSON.stringify({ ok: true, result: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );
});

const originalFetch = globalThis.fetch;
globalThis.fetch = (input: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
  if (String(url).includes('api.telegram.org')) return telegramFetchMock(input, init);
  return originalFetch(input, init);
};

type ScenarioExpect = {
  minTelegramCalls?: number;
  maxTelegramCalls?: number;
  firstMethod?: string;
};

function getExpected(name: string): ScenarioExpect {
  switch (name) {
    case '01_start':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '02_start_again':
      return { minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '03_book':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '04_ask':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '05_question_text':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '06_more_menu':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '07_default_idle':
      return { minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '08_callback_notifications':
      return { minTelegramCalls: 1, firstMethod: 'editMessageText' };
    case '09_callback_toggle_spb':
      return { minTelegramCalls: 1 };
    case '10_callback_my_bookings':
      return { minTelegramCalls: 1, firstMethod: 'editMessageText' };
    case '11_callback_back':
      return { minTelegramCalls: 1 };
    case '12_callback_unknown':
      return { minTelegramCalls: 1, firstMethod: 'answerCallbackQuery' };
    case '13_duplicate_update_id':
      return { minTelegramCalls: 0, maxTelegramCalls: 0 };
    default:
      return {};
  }
}

async function loadFixtures(): Promise<{ name: string; payload: unknown }[]> {
  const files = (await readdir(fixturesDir)).filter((f) => f.endsWith('.json')).sort();
  const out: { name: string; payload: unknown }[] = [];
  for (const file of files) {
    const payload = JSON.parse(await readFile(`${fixturesDir}/${file}`, 'utf-8'));
    out.push({ name: file.replace(/\.json$/, ''), payload });
  }
  return out;
}

async function buildMockedApp() {
  vi.resetModules();
  const mod = (await import('./webhook.js')) as typeof import('./webhook.js');

  const stateByTelegramId = new Map<string, string | null>();
  const notifByTelegramId = new Map<number, { notify_spb: boolean; notify_msk: boolean; notify_online: boolean }>();
  const lastUpdateByTelegramId = new Map<number, number>();
  const startConsumedByTelegramId = new Set<number>();

  const app = Fastify({ logger: false });
  await mod.telegramWebhookRoutes(app, {
    userPort: {
      upsertTelegramUser: vi.fn(async (from) => {
        const id = String(from?.id ?? '');
        return id ? { id, telegram_id: id } : null;
      }),
      setTelegramUserState: vi.fn(async (telegramId, state) => {
        stateByTelegramId.set(telegramId, state);
      }),
      getTelegramUserState: vi.fn(async (telegramId) => stateByTelegramId.get(telegramId) ?? 'idle'),
      tryAdvanceLastUpdateId: vi.fn(async (telegramId, updateId) => {
        const prev = lastUpdateByTelegramId.get(telegramId);
        if (prev == null || prev < updateId) {
          lastUpdateByTelegramId.set(telegramId, updateId);
          return true;
        }
        return false;
      }),
      tryConsumeStart: vi.fn(async (telegramId: number) => {
        if (startConsumedByTelegramId.has(telegramId)) return false;
        startConsumedByTelegramId.add(telegramId);
        return true;
      }),
    },
    notificationsPort: {
      getNotificationSettings: vi.fn(async (telegramId) => (
        notifByTelegramId.get(telegramId)
        ?? { notify_spb: false, notify_msk: false, notify_online: false }
      )),
      updateNotificationSettings: vi.fn(async (telegramId, patch) => {
        const current = notifByTelegramId.get(telegramId)
          ?? { notify_spb: false, notify_msk: false, notify_online: false };
        notifByTelegramId.set(telegramId, { ...current, ...patch });
      }),
    },
    getRubitimeRecordById: vi.fn(async () => null),
    findTelegramUserByPhone: vi.fn(async () => null),
    getTelegramUserLinkData: vi.fn(async (telegramId: string) => ({
      chatId: Number(telegramId),
      telegramId,
      username: 'fixture-user',
      phoneNormalized: null,
    })),
    setTelegramUserPhone: vi.fn(async () => undefined),
  });
  await app.ready();
  return app;
}

describe('telegram webhook fixture scenarios (mocked deps)', () => {
  beforeEach(() => {
    recordedCalls.length = 0;
    telegramFetchMock.mockClear();
  });

  it('matches expected dispatch shape for 01..13 fixture sequence', async () => {
    const fixtures = await loadFixtures();
    const app = await buildMockedApp();
    try {
      for (const { name, payload } of fixtures) {
        recordedCalls.length = 0;
        const res = await app.inject({
          method: 'POST',
          url: '/webhook/telegram',
          headers: { 'content-type': 'application/json' },
          payload: payload as object,
        });

        expect(res.statusCode).toBe(200);
        const expected = getExpected(name);
        if (expected.minTelegramCalls != null) {
          expect(recordedCalls.length).toBeGreaterThanOrEqual(expected.minTelegramCalls);
        }
        if (expected.maxTelegramCalls != null) {
          expect(recordedCalls.length).toBeLessThanOrEqual(expected.maxTelegramCalls);
        }
        if (expected.firstMethod != null) {
          expect(recordedCalls[0]?.method).toBe(expected.firstMethod);
        }
      }
    } finally {
      await app.close();
    }
  });
});
