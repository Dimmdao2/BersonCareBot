/**
 * E2E тесты сценариев: те же фикстуры и ожидания, что и pnpm run scenarios,
 * но через Vitest (expect, отчёт в test run).
 *
 * Требуется: .env с DATABASE_URL, BOT_TOKEN, ADMIN_TELEGRAM_ID, INBOX_CHAT_ID, BOOKING_URL.
 * Мок Telegram: подмена globalThis.fetch до загрузки приложения.
 */
import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const __dirname = fileURLToPath(new URL('.', import.meta.url));

const recordedCalls: { path: string; method: string; body: unknown }[] = [];

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
const mockFetch: typeof fetch = async (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
  const path = new URL(url).pathname;
  const method = path.replace(/^\/bot[^/]+\//, '') || 'unknown';
  let body: unknown = init?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* leave as string */
    }
  }
  recordedCalls.push({ path, method, body });
  return new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
};

const originalFetch = globalThis.fetch;
globalThis.fetch = (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : (input as { url: string }).url;
  if (String(url).includes('api.telegram.org')) return mockFetch(input, init);
  return originalFetch(input, init);
};

function clearRecordedCalls(): void {
  recordedCalls.length = 0;
}

async function loadFixtures(): Promise<{ name: string; payload: unknown }[]> {
  const dir = join(__dirname, 'fixtures', 'telegram');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const out: { name: string; payload: unknown }[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), 'utf-8');
    out.push({ name: f.replace(/\.json$/, ''), payload: JSON.parse(raw) });
  }
  return out;
}

type ScenarioExpect = {
  status: number;
  minTelegramCalls?: number;
  maxTelegramCalls?: number;
  firstMethod?: string;
};

function getExpected(name: string): ScenarioExpect {
  const base = { status: 200 };
  switch (name) {
    case '01_start':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '02_start_again':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '03_book':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '04_ask':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '05_question_text':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '06_more_menu':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '07_default_idle':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    case '08_callback_notifications':
      return { ...base, minTelegramCalls: 1, firstMethod: 'editMessageText' };
    case '09_callback_toggle_spb':
      return { ...base, minTelegramCalls: 1 };
    case '10_callback_my_bookings':
      return { ...base, minTelegramCalls: 1, firstMethod: 'editMessageText' };
    case '11_callback_back':
      return { ...base, minTelegramCalls: 1 };
    case '12_callback_unknown':
      return { ...base, minTelegramCalls: 1, firstMethod: 'answerCallbackQuery' };
    case '13_duplicate_update_id':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    default:
      return base;
  }
}

const E2E_TEST_TELEGRAM_ID = '111222333';

/** В CI нет реальной БД — пропускаем e2e, требующие PostgreSQL. */
const hasE2EDb = process.env.CI !== 'true';

describe.skipIf(!hasE2EDb)('Webhook scenarios (e2e)', () => {
  let app: Awaited<ReturnType<Awaited<typeof import('../src/app.js')>['buildApp']>>;
  let fixtures: { name: string; payload: unknown }[];
  let webhookSecret: string | undefined;

  beforeAll(async () => {
    fixtures = await loadFixtures();
    const { buildApp } = await import('../src/app.js');
    app = buildApp();
    await app.ready();

    const { db } = await import('../src/persistence/client.js');
    await db.query(
      `UPDATE telegram_users SET last_start_at = NULL, last_update_id = NULL WHERE telegram_id = $1`,
      [E2E_TEST_TELEGRAM_ID],
    ).catch(() => {});

    const env = (await import('../src/config/env.js')).env;
    webhookSecret = env.TG_WEBHOOK_SECRET;
  }, 30000);

  afterAll(async () => {
    const { db } = await import('../src/persistence/client.js');
    await db.query(`DELETE FROM telegram_users WHERE telegram_id = $1`, [E2E_TEST_TELEGRAM_ID]).catch(() => {});
    await app.close();
  }, 10000);

  it('runs all fixture scenarios in order', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (typeof webhookSecret === 'string') headers['x-telegram-bot-api-secret-token'] = webhookSecret;

    for (const { name, payload } of fixtures) {
      clearRecordedCalls();
      const res = await app.inject({
        method: 'POST',
        url: '/webhook/telegram',
        headers,
        payload: payload as object,
      });

      const expect_ = getExpected(name);
      expect(res.statusCode).toBe(expect_.status);
      if (expect_.minTelegramCalls != null) {
        expect(recordedCalls.length).toBeGreaterThanOrEqual(expect_.minTelegramCalls);
      }
      if (expect_.maxTelegramCalls != null) {
        expect(recordedCalls.length).toBeLessThanOrEqual(expect_.maxTelegramCalls);
      }
      if (expect_.firstMethod != null) {
        expect(recordedCalls[0]?.method).toBe(expect_.firstMethod);
      }
    }
  });

  it('wrong secret returns 403 when TG_WEBHOOK_SECRET is set', async () => {
    if (typeof webhookSecret !== 'string') return;
    clearRecordedCalls();
    const res = await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      payload: fixtures[0]!.payload as object,
    });
    expect(res.statusCode).toBe(403);
    expect(recordedCalls.length).toBe(0);
  });
});
