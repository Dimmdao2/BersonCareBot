import type { DeliveryJob, QueuePort } from '../src/kernel/contracts/index.js';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildApp } from '../src/app/index.js';
import { createDefaultDispatchPort } from '../src/infra/adapters/dispatchPort.js';
import { executeJob } from '../src/infra/runtime/worker/jobExecutor.js';
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

describe.skipIf(!runE2E)('Rubitime webhook scenarios (e2e)', () => {
  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  beforeEach(() => {
    clearRecordedCalls();
  });

  it('delivers created-record notification to Telegram when phone is linked', async () => {
    const queuedTasks: Array<{ kind: string; payload: Record<string, unknown> }> = [];
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
      async enqueue(task): Promise<void> {
        queuedTasks.push(task);
      },
    };
    const dispatchPort = createDefaultDispatchPort({
      adapters: [
        createTelegramDeliveryAdapter(),
        createSmscDeliveryAdapter({ smsClient }),
      ],
      writePort: dbWritePort,
    });
    const app = buildApp({
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
    expect(queuedTasks).toHaveLength(1);
    expect(queuedTasks[0]?.payload.targets).toMatchObject([
      { resource: 'telegram', address: { chatId: 123456 } },
    ]);

    const result = await executeJob(buildQueuedJob(queuedTasks[0]!, 'telegram'), {
      dispatchOutgoing: (intent) => dispatchPort.dispatchOutgoing(intent),
    });

    expect(result.ok).toBe(true);
    expect(recordedTelegramCalls).toHaveLength(1);
    expect(recordedTelegramCalls[0]?.method).toBe('sendMessage');
    expect(smsClient.sendSms).not.toHaveBeenCalled();
    expect(writes.some((mutation) => mutation.type === 'delivery.attempt.log')).toBe(true);

    await app.close();
  });

  it('falls back to SMS when no Telegram link is found', async () => {
    const queuedTasks: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const smsClient: SmsClient = {
      sendSms: vi.fn().mockResolvedValue({ ok: true }),
    };
    const app = buildApp({
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
        async enqueue(task): Promise<void> {
          queuedTasks.push(task);
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
    expect(queuedTasks).toHaveLength(1);
    expect(queuedTasks[0]?.payload.targets).toMatchObject([
      { resource: 'smsc', address: { phoneNormalized: '+79990002233' } },
    ]);

    const result = await executeJob(buildQueuedJob(queuedTasks[0]!, 'sms'), {
      dispatchOutgoing: async (intent) => {
        await createDefaultDispatchPort({
          adapters: [
            createTelegramDeliveryAdapter(),
            createSmscDeliveryAdapter({ smsClient }),
          ],
        }).dispatchOutgoing(intent);
      },
    });

    expect(result.ok).toBe(true);
    expect(recordedTelegramCalls).toHaveLength(0);
    expect(smsClient.sendSms).toHaveBeenCalledWith(expect.objectContaining({
      toPhone: '+79990002233',
    }));

    await app.close();
  });

  it('recognizes status_name payloads and still queues a Telegram notification', async () => {
    const queuedTasks: Array<{ kind: string; payload: Record<string, unknown> }> = [];
    const app = buildApp({
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
        async enqueue(task): Promise<void> {
          queuedTasks.push(task);
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
    expect(queuedTasks).toHaveLength(1);
    expect(queuedTasks[0]?.payload.targets).toMatchObject([
      { resource: 'telegram', address: { chatId: 987654 } },
    ]);

    await app.close();
  });
});
