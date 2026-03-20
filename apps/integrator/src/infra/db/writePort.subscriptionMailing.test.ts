import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import {
  MAILING_TOPIC_UPSERTED,
  USER_SUBSCRIPTION_UPSERTED,
  MAILING_LOG_SENT,
} from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('writePort subscription/mailing projection events', () => {
  function makeMockDb(capture: {
    projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
  }): DbPort {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('projection_outbox')) {
        const [eventType, idempotencyKey, _occurredAt, payloadJson] = params as [string, string, string, string];
        let payload: unknown = {};
        try {
          payload = JSON.parse(payloadJson) as Record<string, unknown>;
        } catch {
          // ignore
        }
        capture.projectionInserts.push({ eventType, idempotencyKey, payload });
        return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => {
      return fn({ query, tx } as DbPort);
    });
    return { query, tx } as DbPort;
  }

  it('mailing.topic.upsert enqueues mailing.topic.upserted with deterministic idempotency key', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'mailing.topic.upsert',
      params: {
        integratorTopicId: 100,
        code: 'news',
        title: 'News',
        key: 'news',
        isActive: true,
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(MAILING_TOPIC_UPSERTED);
    expect(ev.idempotencyKey).toContain(MAILING_TOPIC_UPSERTED);
    expect(ev.idempotencyKey).toContain('100');
    const payload = ev.payload as Record<string, unknown>;
    expect(payload.integratorTopicId).toBe('100');
    expect(payload.code).toBe('news');
    expect(payload.title).toBe('News');
    expect(payload.key).toBe('news');
    expect(payload.isActive).toBe(true);
    expect(typeof payload.updatedAt).toBe('string');
  });

  it('user.subscription.upsert enqueues user.subscription.upserted', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'user.subscription.upsert',
      params: {
        integratorUserId: 1,
        integratorTopicId: 100,
        isActive: false,
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(USER_SUBSCRIPTION_UPSERTED);
    expect(ev.idempotencyKey).toContain('1:100');
    const payload = ev.payload as Record<string, unknown>;
    expect(payload.integratorUserId).toBe('1');
    expect(payload.integratorTopicId).toBe('100');
    expect(payload.isActive).toBe(false);
  });

  it('mailing.log.append enqueues mailing.log.sent', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'mailing.log.append',
      params: {
        integratorUserId: 1,
        integratorMailingId: 200,
        status: 'sent',
        sentAt: '2025-03-01T12:00:00.000Z',
        errorText: null,
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(MAILING_LOG_SENT);
    expect(ev.idempotencyKey).toContain('1:200');
    const payload = ev.payload as Record<string, unknown>;
    expect(payload.integratorUserId).toBe('1');
    expect(payload.integratorMailingId).toBe('200');
    expect(payload.status).toBe('sent');
    expect(payload.sentAt).toBe('2025-03-01T12:00:00.000Z');
    expect(payload.errorText).toBeNull();
  });
});
