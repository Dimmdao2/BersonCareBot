import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { APPOINTMENT_RECORD_UPSERTED } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('writePort booking.upsert projection', () => {
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
      if (typeof sql === 'string' && sql.includes('rubitime_records')) {
        return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => {
      return fn({ query, tx } as DbPort);
    });
    return { query, tx } as DbPort;
  }

  it('booking.upsert enqueues appointment.record.upserted in same tx', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: 'rec-app-1',
        phoneNormalized: '+79991234567',
        recordAt: '2025-06-01T10:00:00.000Z',
        status: 'created',
        payloadJson: { link: 'https://example.com' },
        lastEvent: 'event-create',
      },
    });
    expect(capture.projectionInserts.length).toBe(1);
    const ev = capture.projectionInserts[0]!;
    expect(ev.eventType).toBe(APPOINTMENT_RECORD_UPSERTED);
    const payload = ev.payload as Record<string, unknown>;
    expect(payload.integratorRecordId).toBe('rec-app-1');
    expect(payload.phoneNormalized).toBe('+79991234567');
    expect(payload.recordAt).toBe('2025-06-01T10:00:00.000Z');
    expect(payload.status).toBe('created');
    expect(payload.lastEvent).toBe('event-create');
    expect(ev.idempotencyKey.startsWith(`${APPOINTMENT_RECORD_UPSERTED}:rec-app-1:`)).toBe(true);
  });
});
