import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { APPOINTMENT_RECORD_UPSERTED } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('writePort booking.upsert projection', () => {
  function makeMockDb(capture: {
    projectionInserts: { eventType: string; idempotencyKey: string; payload: unknown }[];
  }): DbPort {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('merged_into_user_id') && sql.includes('FROM users')) {
        const id = String((params as string[])[0] ?? '');
        if (id === '2') {
          return { rows: [{ merged_into_user_id: '100' }] } as Awaited<ReturnType<DbPort['query']>>;
        }
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort['query']>>;
      }
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

  it('booking.upsert canonicalizes integrator ids inside payloadJson for projection only', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    const payloadJson = { integrator_user_id: '2', link: 'https://rubitime.example/r' };
    await writePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: 'rec-canonical-pj',
        phoneNormalized: '+79990001122',
        recordAt: '2025-06-01T10:00:00.000Z',
        status: 'updated',
        payloadJson,
        lastEvent: 'sync',
      },
    });
    const rubitimeCalls = (db.query as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      String(c[0]).includes('rubitime_records'),
    );
    const lastRubitimeParams = rubitimeCalls[rubitimeCalls.length - 1]?.[1] as unknown[] | undefined;
    const storedPayloadJson = lastRubitimeParams?.[5];
    expect(JSON.parse(String(storedPayloadJson))).toEqual(payloadJson);

    const pj = (capture.projectionInserts[0]!.payload as Record<string, unknown>).payloadJson as Record<
      string,
      unknown
    >;
    expect(pj.integrator_user_id).toBe('100');
    expect(pj.link).toBe('https://rubitime.example/r');
  });

  it('booking.upsert keeps ISO-Z recordAt and passes timeNormalization metadata to projection', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: 'rec-tz-1',
        phoneNormalized: '+79990001122',
        recordAt: '2026-04-07T08:00:00.000Z',
        dateTimeEnd: '2026-04-07T09:00:00.000Z',
        status: 'updated',
        payloadJson: { service_id: 10, service_name: 'Consult' },
        lastEvent: 'updated',
        timeNormalizationStatus: 'ok',
        timeNormalizationFieldErrors: [],
      },
    });
    const payload = capture.projectionInserts[0]!.payload as Record<string, unknown>;
    expect(payload.recordAt).toBe('2026-04-07T08:00:00.000Z');
    expect(payload.dateTimeEnd).toBe('2026-04-07T09:00:00.000Z');
    expect(payload.timeNormalizationStatus).toBe('ok');
    expect(payload.timeNormalizationFieldErrors).toBeUndefined();
    expect(payload.serviceId).toBe('10');
    expect(payload.serviceName).toBe('Consult');
  });

  it('booking.upsert drops naive recordAt so SQL never gets session-TZ interpretation', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: 'rec-naive',
        phoneNormalized: '+79990001122',
        recordAt: '2026-04-07 11:00:00',
        status: 'updated',
        payloadJson: {},
        lastEvent: 'updated',
      },
    });
    const payload = capture.projectionInserts[0]!.payload as Record<string, unknown>;
    expect(payload.recordAt).toBeNull();
  });

  it('event.log booking writes action field as event (not "unknown")', async () => {
    const eventInserts: { externalRecordId: string | null; event: string; payloadJson: unknown }[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('rubitime_events')) {
        const [externalRecordId, event, payloadJsonStr] = params as [string | null, string, string];
        let payloadJson: unknown = {};
        try { payloadJson = JSON.parse(payloadJsonStr); } catch { /* */ }
        eventInserts.push({ externalRecordId, event, payloadJson });
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx } as DbPort));
    const db = { query, tx } as DbPort;
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: 'event.log',
      params: {
        eventStore: 'booking',
        source: 'rubitime',
        event: 'webhook.received',
        body: {
          action: 'created',
          entity: 'record',
          recordId: '8077942',
          phone: '+79119975939',
        },
      },
    });
    expect(eventInserts.length).toBe(1);
    expect(eventInserts[0]!.event).toBe('created');
    expect(eventInserts[0]!.externalRecordId).toBe('8077942');
  });

  it('event.log booking falls back to eventType then unknown', async () => {
    const eventInserts: { event: string }[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('rubitime_events')) {
        eventInserts.push({ event: params[1] as string });
      }
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => fn({ query, tx } as DbPort));
    const db = { query, tx } as DbPort;
    const writePort = createDbWritePort({ db });

    await writePort.writeDb({
      type: 'event.log',
      params: { eventStore: 'booking', body: { eventType: 'webhook.received', recordId: 'x' } },
    });
    expect(eventInserts[0]!.event).toBe('webhook.received');

    eventInserts.length = 0;
    await writePort.writeDb({
      type: 'event.log',
      params: { eventStore: 'booking', body: { recordId: 'y' } },
    });
    expect(eventInserts[0]!.event).toBe('unknown');
  });

  it('booking.upsert includes timeNormalizationFieldErrors when degraded', async () => {
    const capture = { projectionInserts: [] as { eventType: string; idempotencyKey: string; payload: unknown }[] };
    const db = makeMockDb(capture);
    const writePort = createDbWritePort({ db });
    await writePort.writeDb({
      type: 'booking.upsert',
      params: {
        externalRecordId: 'rec-degraded',
        phoneNormalized: '+79990001122',
        recordAt: null,
        status: 'updated',
        payloadJson: { link: 'https://x.example' },
        lastEvent: 'updated',
        timeNormalizationStatus: 'degraded',
        timeNormalizationFieldErrors: [{ field: 'recordAt', reason: 'unsupported_format' }],
      },
    });
    const payload = capture.projectionInserts[0]!.payload as Record<string, unknown>;
    expect(payload.recordAt).toBeNull();
    expect(payload.timeNormalizationStatus).toBe('degraded');
    expect(payload.timeNormalizationFieldErrors).toEqual([
      { field: 'recordAt', reason: 'unsupported_format' },
    ]);
    expect(payload.payloadJson).toEqual({ link: 'https://x.example' });
  });
});
