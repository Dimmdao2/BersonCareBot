/**
 * E2E тесты сценариев: те же фикстуры и ожидания, что и pnpm run scenarios,
 * но через Vitest (expect, отчёт в test run).
 *
 * Требуется: .env с DATABASE_URL и BOOKING_URL.
 * Мок Telegram: подмена globalThis.fetch до загрузки приложения.
 *
 * Сценарии без бот-UI настроек уведомлений (убран из content); уведомления — в вебаппе.
 */
import { readdir, readFile } from 'node:fs/promises';
import type { DeliveryJob, DispatchPort } from '../src/kernel/contracts/index.js';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createDefaultDispatchPort } from '../src/infra/adapters/dispatchPort.js';
import { executeJob } from '../src/infra/runtime/worker/jobExecutor.js';

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
    id: `e2e-job:${suffix}`,
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

/** E2E запускаются только по явному флагу RUN_E2E_TESTS=true. */
const runE2E = process.env.RUN_E2E_TESTS === 'true';

describe.skipIf(!runE2E)('Webhook scenarios (e2e)', () => {
  let app: Awaited<ReturnType<Awaited<typeof import('../src/app/index.js')>['buildApp']>>;
  let fixtures: { name: string; payload: unknown }[];
  let webhookSecret: string | undefined;
  const idempotencyKeys = new Set<string>();

  const inMemoryState = {
    states: new Map<string, string>(),
    phones: new Map<string, string>(),
    lastUpdateId: new Map<number, number>(),
    lastStartAt: new Set<number>(),
  };

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

  let dispatchPort: DispatchPort;

  beforeAll(async () => {
    fixtures = await loadFixtures();
    idempotencyKeys.clear();
    const { createTelegramDeliveryAdapter } = await import('../src/integrations/telegram/deliveryAdapter.js');
    dispatchPort = createDefaultDispatchPort({
      adapters: [createTelegramDeliveryAdapter()],
    });
    const { buildApp } = await import('../src/app/index.js');
    const { registerTelegramWebhookRoutes } = await import('../src/integrations/telegram/webhook.js');
    app = await buildApp({
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
      registerTelegramWebhookRoutes,
    });
    await app.ready();

    const { telegramConfig } = await import('../src/integrations/telegram/config.js');
    webhookSecret = telegramConfig.webhookSecret;
  }, 30000);

  afterAll(async () => {
    await app.close();
  }, 10000);

  it('runs all fixture scenarios in order', async () => {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (typeof webhookSecret === 'string') headers['x-telegram-bot-api-secret-token'] = webhookSecret;

    for (const { name, payload } of fixtures) {
      clearRecordedCalls();
      queuePort.tasks.length = 0;
      const res = await app.inject({
        method: 'POST',
        url: '/webhook/telegram',
        headers,
        payload: payload as object,
      });
      for (const [index, task] of queuePort.tasks.entries()) {
        await executeJob(buildQueuedJob(task, `${name}:${index}`), {
          dispatchOutgoing: (intent) => dispatchPort.dispatchOutgoing(intent),
        });
      }

      const expect_ = getExpected(name);
      expect(res.statusCode).toBe(expect_.status);
      const contentCalls = recordedCalls.filter((c) => c.method !== 'setChatMenuButton');
      if (expect_.minTelegramCalls != null) {
        expect(contentCalls.length).toBeGreaterThanOrEqual(expect_.minTelegramCalls);
      }
      if (expect_.maxTelegramCalls != null) {
        expect(contentCalls.length).toBeLessThanOrEqual(expect_.maxTelegramCalls);
      }
      if (expect_.firstMethod != null) {
        expect(contentCalls[0]?.method).toBe(expect_.firstMethod);
      }
    }
  });

  it('wrong secret returns 403 when Telegram webhook secret is set', async () => {
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
