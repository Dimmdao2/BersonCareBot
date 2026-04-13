/**
 * E2E scenario runner: sends Telegram webhook payloads to the app,
 * mocks Telegram API by patching globalThis.fetch (grammy uses fetch).
 *
 * Run: pnpm run scenarios
 * Requires: .env with DATABASE_URL and BOOKING_URL.
 * Telegram keys are read from src/integrations/telegram/config.ts.
 *
 * Фикстуры без бот-уведомлений (см. content); уведомления настраиваются в вебаппе.
 */

import { readdir, readFile } from 'node:fs/promises';
import type { DeliveryJob, OutgoingIntent } from '../src/kernel/contracts/index.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createDefaultDispatchPort } from '../src/infra/adapters/dispatchPort.js';
import { executeJob } from '../src/infra/runtime/worker/jobExecutor.js';

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
dotenv.config({ path: join(rootDir, '.env'), quiet: true });

function clearRecordedCalls(): void {
  recordedCalls.length = 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

function buildQueuedJob(task: { kind: string; payload: Record<string, unknown> }, suffix: string): DeliveryJob {
  const retry = asRecord(task.payload.retry);
  const maxAttemptsRaw = retry.maxAttempts;
  const maxAttempts = typeof maxAttemptsRaw === 'number' && Number.isFinite(maxAttemptsRaw)
    ? Math.max(1, Math.trunc(maxAttemptsRaw))
    : 1;
  return {
    id: `scenario-job:${suffix}`,
    kind: task.kind,
    runAt: '2026-03-10T10:00:00.000Z',
    attempts: 0,
    maxAttempts,
    payload: task.payload,
  };
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
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
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
    case '10_callback_my_bookings':
      return { ...base, minTelegramCalls: 1, maxTelegramCalls: 2, firstMethod: 'sendMessage' };
    case '11_callback_back':
      return { ...base, minTelegramCalls: 2, maxTelegramCalls: 2, firstMethod: 'editMessageText' };
    case '12_callback_unknown':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '13_duplicate_update_id':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    default:
      return base;
  }
}

const inMemoryState = {
  states: new Map<string, string>(),
  phones: new Map<string, string>(),
};
const idempotencyKeys = new Set<string>();

const asChannelUserId = (value: unknown): string | null => {
  if (typeof value === 'string' && value.length > 0) return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return null;
};

const dbReadPort = {
  async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
    if (query.type === 'user.lookup') {
      const by = query.params.by;
      const value = query.params.value;
      if (by === 'phone' && typeof value === 'string') {
        for (const [channelUserId, phone] of inMemoryState.phones.entries()) {
          if (phone !== value) continue;
          const chatId = Number(channelUserId);
          if (!Number.isFinite(chatId)) return null as T;
          return { chatId, channelId: channelUserId, username: null } as T;
        }
      }
      return null as T;
    }

    if (query.type === 'user.byIdentity') {
      const externalId = query.params.externalId;
      if (typeof externalId === 'string' && externalId.length > 0) {
        return {
          userState: inMemoryState.states.get(externalId) ?? null,
          phoneNormalized: inMemoryState.phones.get(externalId) ?? null,
        } as T;
      }
      return null as T;
    }

    if (query.type === 'booking.activeByUser') return [] as T;
    if (query.type === 'booking.byExternalId') return null as T;
    return null as T;
  },
};

const dbWritePort = {
  async writeDb(mutation: { type: string; params: Record<string, unknown> }): Promise<void> {
    if (mutation.type === 'user.state.set') {
      const channelUserId = asChannelUserId(mutation.params.channelUserId);
      if (channelUserId) {
        const state = typeof mutation.params.state === 'string' ? mutation.params.state : null;
        if (state === null) inMemoryState.states.delete(channelUserId);
        else inMemoryState.states.set(channelUserId, state);
      }
      return;
    }

    if (mutation.type === 'user.phone.link') {
      const channelUserId = asChannelUserId(mutation.params.channelUserId);
      const phoneNormalized = typeof mutation.params.phoneNormalized === 'string'
        ? mutation.params.phoneNormalized
        : null;
      if (channelUserId && phoneNormalized) {
        inMemoryState.phones.set(channelUserId, phoneNormalized);
      }
      return;
    }
  },
};

const queuePort = {
  tasks: [] as Array<{ kind: string; payload: Record<string, unknown> }>,
  async enqueue(task: { kind: string; payload: Record<string, unknown> }): Promise<void> {
    this.tasks.push(task);
  },
};

let dispatchPort: { dispatchOutgoing: (intent: OutgoingIntent) => Promise<void> };

async function main(): Promise<void> {
  idempotencyKeys.clear();
  const { createTelegramDeliveryAdapter } = await import('../src/integrations/telegram/deliveryAdapter.js');
  dispatchPort = createDefaultDispatchPort({
    adapters: [createTelegramDeliveryAdapter()],
  });
  const { buildApp } = await import('../src/app/index.js');
  const app = await buildApp({
    dbReadPort,
    dbWritePort,
    queuePort,
    dispatchPort,
    idempotencyPort: {
      async tryAcquire(key: string): Promise<boolean> {
        if (idempotencyKeys.has(key)) return false;
        idempotencyKeys.add(key);
        return true;
      },
    },
  });
  await app.ready();

  const { telegramConfig } = await import('../src/integrations/telegram/config.js');
  const webhookSecret = telegramConfig.webhookSecret;
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
    queuePort.tasks.length = 0;
    const res = (await app.inject({
      method: 'POST',
      url: '/webhook/telegram',
      headers,
      payload: payload as object,
    })) as InjectRes;
    for (const [index, task] of queuePort.tasks.entries()) {
      await executeJob(buildQueuedJob(task, `${name}:${index}`), {
        dispatchOutgoing: (intent) => dispatchPort.dispatchOutgoing(intent),
      });
    }
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

  // Wrong secret (only if Telegram webhook secret is set)
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

  await app.close();
  console.log('');
  console.log(`Scenarios: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err: unknown) => {
  if (err != null && typeof err === 'object' && 'issues' in err) {
    console.error('Env validation failed. Add .env with DATABASE_URL and BOOKING_URL.');
  }
  console.error(err);
  process.exit(1);
});
