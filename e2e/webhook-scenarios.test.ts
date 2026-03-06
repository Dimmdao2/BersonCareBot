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
    case '08_callback_notifications':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '09_callback_toggle_spb':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '10_callback_my_bookings':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '11_callback_back':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '12_callback_unknown':
      return { ...base, minTelegramCalls: 0, maxTelegramCalls: 0 };
    case '13_duplicate_update_id':
      return { ...base, minTelegramCalls: 1, firstMethod: 'sendMessage' };
    default:
      return base;
  }
}

const E2E_TEST_TELEGRAM_ID = '111222333';

/** E2E запускаются только по явному флагу RUN_E2E_TESTS=true. */
const runE2E = process.env.RUN_E2E_TESTS === 'true';

describe.skipIf(!runE2E)('Webhook scenarios (e2e)', () => {
  let app: Awaited<ReturnType<Awaited<typeof import('../src/app/index.js')>['buildApp']>>;
  let fixtures: { name: string; payload: unknown }[];
  let webhookSecret: string | undefined;

  const inMemoryState = {
    users: new Map<string, { id: string; telegram_id: string }>(),
    states: new Map<string, string>(),
    phones: new Map<string, string>(),
    lastUpdateId: new Map<number, number>(),
    lastStartAt: new Set<number>(),
    notifications: new Map<number, { notify_spb: boolean; notify_msk: boolean; notify_online: boolean }>(),
  };

  const asChannelUserId = (value: unknown): string | null => {
    if (typeof value === 'string' && value.length > 0) return value;
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
    return null;
  };

  const dbReadPort = {
    async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
      if (query.type === 'notifications.settings') {
        const id = query.params.channelUserId;
        const key = typeof id === 'number' && Number.isFinite(id) ? id : Number.NaN;
        const settings = Number.isFinite(key)
          ? inMemoryState.notifications.get(key) ?? { notify_spb: false, notify_msk: false, notify_online: false }
          : { notify_spb: false, notify_msk: false, notify_online: false };
        return settings as T;
      }

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

      if (mutation.type === 'notifications.update') {
        const id = mutation.params.channelUserId;
        const channelUserId = typeof id === 'number' && Number.isFinite(id) ? id : null;
        if (channelUserId === null) return;
        const prev = inMemoryState.notifications.get(channelUserId) ?? {
          notify_spb: false,
          notify_msk: false,
          notify_online: false,
        };
        inMemoryState.notifications.set(channelUserId, {
          notify_spb: typeof mutation.params.notify_spb === 'boolean' ? mutation.params.notify_spb : prev.notify_spb,
          notify_msk: typeof mutation.params.notify_msk === 'boolean' ? mutation.params.notify_msk : prev.notify_msk,
          notify_online: typeof mutation.params.notify_online === 'boolean' ? mutation.params.notify_online : prev.notify_online,
        });
      }
    },
  };

  const queuePort = {
    async enqueue(): Promise<void> {
      return;
    },
  };

  let telegramAdapter: {
    canHandle: (intent: any) => boolean;
    send: (intent: any) => Promise<void>;
  } | null = null;
  const dispatchPort = {
    async dispatchOutgoing(intent: { type: string; meta: { source: string }; payload: unknown }): Promise<void> {
      if (!telegramAdapter) return;
      if (!telegramAdapter.canHandle(intent as never)) return;
      await telegramAdapter.send(intent as never);
    },
  };

  const userPort = {
    async upsertTelegramUser(from: { id: number } | null | undefined) {
      if (!from?.id) return null;
      const telegramId = String(from.id);
      const existing = inMemoryState.users.get(telegramId);
      if (existing) return existing;
      const row = { id: telegramId, telegram_id: telegramId };
      inMemoryState.users.set(telegramId, row);
      return row;
    },
    async setTelegramUserState(telegramId: string, state: string | null) {
      if (state == null) inMemoryState.states.delete(telegramId);
      else inMemoryState.states.set(telegramId, state);
    },
    async setTelegramUserPhone(telegramId: string, phoneNormalized: string) {
      inMemoryState.phones.set(telegramId, phoneNormalized);
    },
    async getTelegramUserState(telegramId: string) {
      return inMemoryState.states.get(telegramId) ?? null;
    },
    async tryAdvanceLastUpdateId(telegramId: number, updateId: number) {
      const prev = inMemoryState.lastUpdateId.get(telegramId) ?? -1;
      if (updateId <= prev) return false;
      inMemoryState.lastUpdateId.set(telegramId, updateId);
      return true;
    },
    async tryConsumeStart(telegramId: number) {
      if (inMemoryState.lastStartAt.has(telegramId)) return false;
      inMemoryState.lastStartAt.add(telegramId);
      return true;
    },
  };

  const getNotificationSettings = async (telegramId: number) =>
    inMemoryState.notifications.get(telegramId) ?? {
      notify_spb: false,
      notify_msk: false,
      notify_online: false,
    };

  const notificationsPort = {
    getNotificationSettings,
    async updateNotificationSettings(
      telegramId: number,
      settings: { notify_spb?: boolean; notify_msk?: boolean; notify_online?: boolean },
    ) {
      const prev = await getNotificationSettings(telegramId);
      inMemoryState.notifications.set(telegramId, { ...prev, ...settings });
    },
  };

  const getTelegramUserLinkData = async (telegramId: string) => {
    const user = inMemoryState.users.get(telegramId);
    if (!user) return null;
    return {
      chatId: Number(telegramId),
      telegramId,
      username: null,
      phoneNormalized: inMemoryState.phones.get(telegramId) ?? null,
    };
  };

  beforeAll(async () => {
    fixtures = await loadFixtures();
    const { createTelegramDeliveryAdapter } = await import('../src/integrations/telegram/deliveryAdapter.js');
    telegramAdapter = createTelegramDeliveryAdapter();
    const { buildApp } = await import('../src/app/index.js');
    const { registerTelegramWebhookRoutes } = await import('../src/integrations/telegram/webhook.js');
    app = buildApp({
      dbReadPort,
      dbWritePort,
      queuePort,
      dispatchPort,
      registerTelegramWebhookRoutes,
    });
    await app.ready();

    const env = (await import('../src/config/env.js')).env;
    webhookSecret = env.TG_WEBHOOK_SECRET;
  }, 30000);

  afterAll(async () => {
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
