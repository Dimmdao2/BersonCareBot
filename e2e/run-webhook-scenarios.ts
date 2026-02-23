/**
 * E2E scenario runner: sends Telegram webhook payloads to the app,
 * mocks Telegram API by patching globalThis.fetch (grammy uses fetch).
 *
 * Run: pnpm run scenarios
 * Requires: .env with DATABASE_URL, BOT_TOKEN, ADMIN_TELEGRAM_ID, INBOX_CHAT_ID, BOOKING_URL.
 * Optional: TG_WEBHOOK_SECRET — if set, requests must include the header; we add it for fixture scenarios.
 */

import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const rootDir = join(__dirname, '..');

// Record outbound Telegram API calls for assertions
type RecordedCall = { path: string; method: string; body: unknown };
const recordedCalls: RecordedCall[] = [];

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

// Load env before importing app
const dotenv = await import('dotenv');
dotenv.config({ path: join(rootDir, '.env') });

function clearRecordedCalls(): void {
  recordedCalls.length = 0;
}

async function loadFixtures(): Promise<{ name: string; payload: unknown }[]> {
  const dir = join(__dirname, 'fixtures', 'telegram');
  const files = (await readdir(dir)).filter((f) => f.endsWith('.json')).sort();
  const out: { name: string; payload: unknown }[] = [];
  for (const f of files) {
    const raw = await readFile(join(dir, f), 'utf-8');
    const payload = JSON.parse(raw);
    const name = f.replace(/\.json$/, '');
    out.push({ name, payload });
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

async function main(): Promise<void> {
  const { buildApp } = await import('../src/app.js');
  const app = buildApp();
  await app.ready();

  const { db } = await import('../src/persistence/client.js');
  await db.query(
    `UPDATE telegram_users SET last_start_at = NULL, last_update_id = NULL WHERE telegram_id = $1`,
    [E2E_TEST_TELEGRAM_ID],
  ).catch(() => { /* ignore if table/user missing */ });

  const env = (await import('../src/config/env.js')).env;
  const webhookSecret = env.TG_WEBHOOK_SECRET;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
  };
  if (typeof webhookSecret === 'string') {
    headers['x-telegram-bot-api-secret-token'] = webhookSecret;
  }

  const fixtures = await loadFixtures();
  let passed = 0;
  let failed = 0;

  type InjectRes = { statusCode: number };
  for (const { name, payload } of fixtures) {
    clearRecordedCalls();
    const res = (await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers,
      payload: payload as object,
    })) as InjectRes;
    const expect = getExpected(name);
    const ok =
      res.statusCode === expect.status &&
      (expect.minTelegramCalls == null || recordedCalls.length >= expect.minTelegramCalls) &&
      (expect.maxTelegramCalls == null || recordedCalls.length <= expect.maxTelegramCalls) &&
      (expect.firstMethod == null || recordedCalls[0]?.method === expect.firstMethod);

    if (ok) {
      console.log(`  ✓ ${name}`);
      passed++;
    } else {
      console.error(`  ✗ ${name} (status=${res.statusCode}, tgCalls=${recordedCalls.length}, first=${recordedCalls[0]?.method ?? '-'})`);
      failed++;
    }
  }

  // Wrong secret (only if TG_WEBHOOK_SECRET is set)
  if (typeof webhookSecret === 'string') {
    clearRecordedCalls();
    const wrongRes = (await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers: { 'content-type': 'application/json', 'x-telegram-bot-api-secret-token': 'wrong-secret' },
      payload: fixtures[0]!.payload as object,
    })) as InjectRes;
    const wrongOk = wrongRes.statusCode === 403 && recordedCalls.length === 0;
    if (wrongOk) {
      console.log('  ✓ wrong_secret (403, no Telegram calls)');
      passed++;
    } else {
      console.error('  ✗ wrong_secret');
      failed++;
    }
  }

  await db.query(`DELETE FROM telegram_users WHERE telegram_id = $1`, [E2E_TEST_TELEGRAM_ID]).catch(() => {});

  await app.close();
  console.log('');
  console.log(`Scenarios: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  if (err != null && typeof err === 'object' && 'issues' in err) {
    console.error('Env validation failed. Add .env with DATABASE_URL, BOT_TOKEN, ADMIN_TELEGRAM_ID, INBOX_CHAT_ID, BOOKING_URL.');
  }
  console.error(err);
  process.exit(1);
});
