import type { QueuePort } from '../src/kernel/contracts/index.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app/index.js';
import { createDefaultDispatchPort } from '../src/infra/adapters/dispatchPort.js';
import { createSmscDeliveryAdapter } from '../src/integrations/smsc/deliveryAdapter.js';
import type { SmsClient } from '../src/integrations/smsc/types.js';
import { createTelegramDeliveryAdapter } from '../src/integrations/telegram/deliveryAdapter.js';
import { rubitimeConfig } from '../src/integrations/rubitime/config.js';

const runE2E = process.env.RUN_E2E_TESTS === 'true';

type FetchInput = Parameters<typeof fetch>[0];
type FetchInit = Parameters<typeof fetch>[1];
type RecordedTelegramCall = {
  path: string;
  method: string;
  body: unknown;
};

const recordedTelegramCalls: RecordedTelegramCall[] = [];
const originalFetch = globalThis.fetch;
globalThis.fetch = (input: FetchInput, init?: FetchInit) => {
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  if (String(url).includes('rubitime.ru/api2/get-record')) {
    let body: { id?: unknown } | null = null;
    if (typeof init?.body === 'string') {
      try {
        body = JSON.parse(init.body) as { id?: unknown };
      } catch {
        body = null;
      }
    }
    const id = typeof body?.id === 'string' || typeof body?.id === 'number' ? String(body.id) : 'unknown';
    return Promise.resolve(new Response(JSON.stringify({
      status: 'ok',
      message: 'Success',
      data: {
        id,
        phone: '+79990004455',
        record: '2026-03-10 13:00:00',
        status: 0,
      },
    }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  }
  if (!String(url).includes('api.telegram.org')) return originalFetch(input, init);

  const path = new URL(url).pathname;
  const method = path.replace(/^\/bot[^/]+\//, '') || 'unknown';
  let body: unknown = init?.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body);
    } catch {
      /* keep raw string */
    }
  }
  recordedTelegramCalls.push({ path, method, body });
  return Promise.resolve(new Response(JSON.stringify({ ok: true, result: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  }));
};

function clearRecordedCalls(): void {
  recordedTelegramCalls.length = 0;
}

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : {};
}

describe.skipIf(!runE2E)('Rubitime webhook scenarios (e2e)', () => {
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    clearRecordedCalls();
  });

  it('delivers created-record notification to Telegram when phone is linked', async () => {
    const writes: Array<{ type: string; params: Record<string, unknown> }> = [];
    const smsClient: SmsClient = {
      sendSms: vi.fn().mockResolvedValue({ ok: true }),
    };
    const dbReadPort = {
      async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
        if (query.type === 'user.lookup' && query.params.by === 'phone' && query.params.value === '+79990001122') {
          return { chatId: 123456, channelId: '123456', username: 'linked-user' } as T;
        }
        if (query.type === 'booking.byExternalId') return null as T;
        if (query.type === 'booking.activeByUser') return [] as T;
        return null as T;
      },
    };
    const dbWritePort = {
      async writeDb(mutation: { type: string; params: Record<string, unknown> }): Promise<void> {
        writes.push(mutation);
      },
    };
    const queuePort: QueuePort = {
      async enqueue(): Promise<void> {
        return;
      },
    };
    const dispatchPort = createDefaultDispatchPort({
      adapters: [
        createTelegramDeliveryAdapter(),
        createSmscDeliveryAdapter({ smsClient }),
      ],
      writePort: dbWritePort,
    });
    const app = await buildApp({
      dbReadPort,
      dbWritePort,
      queuePort,
      idempotencyPort: {
        tryAcquire: async () => true,
      },
      dispatchPort,
    });

    await app.ready();
    clearRecordedCalls();
    const response = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${rubitimeConfig.webhookToken}`,
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: {
          record: {
            id: 'rec-telegram',
            phone: '+79990001122',
            datetime: '2026-03-10 10:00:00',
            status: '0',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordedTelegramCalls).toHaveLength(1);
    expect(recordedTelegramCalls[0]?.method).toBe('sendMessage');
    expect(smsClient.sendSms).not.toHaveBeenCalled();
    expect(writes.some((mutation) => mutation.type === 'delivery.attempt.log')).toBe(true);

    await app.close();
  });

  it('falls back to SMS when no Telegram link is found', async () => {
    const smsClient: SmsClient = {
      sendSms: vi.fn().mockResolvedValue({ ok: true }),
    };
    const app = await buildApp({
      dbReadPort: {
        async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
          if (query.type === 'booking.byExternalId') return null as T;
          if (query.type === 'booking.activeByUser') return [] as T;
          return null as T;
        },
      },
      dbWritePort: {
        async writeDb(): Promise<void> {
          return;
        },
      },
      queuePort: {
        async enqueue(): Promise<void> {
          return;
        },
      },
      idempotencyPort: {
        tryAcquire: async () => true,
      },
      dispatchPort: createDefaultDispatchPort({
        adapters: [
          createTelegramDeliveryAdapter(),
          createSmscDeliveryAdapter({ smsClient }),
        ],
      }),
    });

    await app.ready();
    clearRecordedCalls();
    const response = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${rubitimeConfig.webhookToken}`,
      payload: {
        from: 'rubitime',
        event: 'event-create-record',
        data: {
          record: {
            id: 'rec-sms',
            phone: '+79990002233',
            datetime: '2026-03-10 11:00:00',
            status: '0',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordedTelegramCalls).toHaveLength(0);
    expect(smsClient.sendSms).toHaveBeenCalledWith(expect.objectContaining({
      toPhone: '+79990002233',
    }));

    await app.close();
  });

  it('recognizes status_name payloads and still delivers a Telegram notification', async () => {
    const app = await buildApp({
      dbReadPort: {
        async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
          if (query.type === 'user.lookup' && query.params.by === 'phone' && query.params.value === '+79990003344') {
            return { chatId: 987654, channelId: '987654', username: 'status-name-user' } as T;
          }
          if (query.type === 'booking.byExternalId') return null as T;
          if (query.type === 'booking.activeByUser') return [] as T;
          return null as T;
        },
      },
      dbWritePort: {
        async writeDb(): Promise<void> {
          return;
        },
      },
      queuePort: {
        async enqueue(): Promise<void> {
          return;
        },
      },
      idempotencyPort: {
        tryAcquire: async () => true,
      },
      dispatchPort: createDefaultDispatchPort({
        adapters: [
          createTelegramDeliveryAdapter(),
          createSmscDeliveryAdapter({
            smsClient: {
              sendSms: vi.fn().mockResolvedValue({ ok: true }),
            },
          }),
        ],
      }),
    });

    await app.ready();
    clearRecordedCalls();
    const response = await app.inject({
      method: 'POST',
      url: `/webhook/rubitime/${rubitimeConfig.webhookToken}`,
      payload: {
        from: 'rubitime',
        event: 'event-update-record',
        data: {
          record: {
            id: 'rec-status-name',
            phone: '+79990003344',
            datetime: '2026-03-10 12:00:00',
            status: 'custom',
            status_name: 'Записан',
          },
        },
      },
    });

    expect(response.statusCode).toBe(200);
    expect(recordedTelegramCalls).toHaveLength(1);
    expect(recordedTelegramCalls[0]?.method).toBe('sendMessage');

    await app.close();
  });

  it('supports legacy record_success callback by fetching record details from Rubitime API', async () => {
    const legacyRecordId = 'legacy-record-id';
    const smsClient: SmsClient = {
      sendSms: vi.fn().mockResolvedValue({ ok: true }),
    };
    const app = await buildApp({
      dbReadPort: {
        async readDb<T = unknown>(query: { type: string; params: Record<string, unknown> }): Promise<T> {
          if (query.type === 'user.lookup' && query.params.by === 'phone' && query.params.value === '+79990004455') {
            return { chatId: 555777, channelId: '555777', username: 'legacy-route-user' } as T;
          }
          if (query.type === 'booking.byExternalId') return null as T;
          if (query.type === 'booking.activeByUser') return [] as T;
          return null as T;
        },
      },
      dbWritePort: {
        async writeDb(): Promise<void> {
          return;
        },
      },
      queuePort: {
        async enqueue(): Promise<void> {
          return;
        },
      },
      idempotencyPort: {
        tryAcquire: async () => true,
      },
      dispatchPort: createDefaultDispatchPort({
        adapters: [
          createTelegramDeliveryAdapter(),
          createSmscDeliveryAdapter({ smsClient }),
        ],
      }),
    });

    await app.ready();
    clearRecordedCalls();
    const token = rubitimeConfig.webhookToken;
    const response = await app.inject({
      method: 'GET',
      url: `/api/rubitime?record_success=${encodeURIComponent(legacyRecordId)}&token=${encodeURIComponent(token)}`,
    });

    expect(response.statusCode).toBe(200);
    expect(recordedTelegramCalls).toHaveLength(1);
    expect(recordedTelegramCalls[0]?.method).toBe('sendMessage');

    await app.close();
  });
});
