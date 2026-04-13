import { describe, expect, it, vi } from 'vitest';
import type { DbPort } from '../../kernel/contracts/index.js';
import { createDbWritePort } from './writePort.js';

describe('writePort booking.upsert → public schema (unified DB)', () => {
  function makeMockDb(capture: { sqlCalls: string[] }): DbPort {
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('merged_into_user_id') && sql.includes('FROM users')) {
        const id = String((params as string[])[0] ?? '');
        if (id === '2') {
          return { rows: [{ merged_into_user_id: '100' }] } as Awaited<ReturnType<DbPort['query']>>;
        }
        return { rows: [{ merged_into_user_id: null }] } as Awaited<ReturnType<DbPort['query']>>;
      }
      capture.sqlCalls.push(sql);
      return { rows: [] } as Awaited<ReturnType<DbPort['query']>>;
    });
    const tx = vi.fn(async (fn: (txDb: DbPort) => Promise<void>) => {
      return fn({ query, tx } as DbPort);
    });
    return { query, tx } as DbPort;
  }

  it('booking.upsert writes appointment_records + patient_bookings in tx (no HTTP projection outbox)', async () => {
    const capture = { sqlCalls: [] as string[] };
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
    const joined = capture.sqlCalls.join('\n');
    expect(joined).toContain('INSERT INTO public.appointment_records');
    expect(joined).toContain('public.patient_bookings');
    expect(joined).not.toContain('projection_outbox');
  });

  it('booking.upsert canonicalizes integrator ids inside payloadJson before public writes', async () => {
    const capture = { sqlCalls: [] as string[] };
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
    const appointmentInsert = capture.sqlCalls.find((s) => s.includes('INSERT INTO public.appointment_records'));
    expect(appointmentInsert).toBeDefined();
    const payloadParam = (db.query as ReturnType<typeof vi.fn>).mock.calls.find(
      (c) => String(c[0]).includes('INSERT INTO public.appointment_records'),
    )?.[1] as unknown[] | undefined;
    const payloadJsonStr = payloadParam?.[4];
    expect(JSON.parse(String(payloadJsonStr))).toMatchObject({
      integrator_user_id: '100',
      link: 'https://rubitime.example/r',
    });
  });

  it('booking.upsert keeps ISO-Z recordAt for public appointment row', async () => {
    const capture = { sqlCalls: [] as string[] };
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
      },
    });
    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO public.appointment_records'),
    );
    const params = call?.[1] as unknown[];
    expect(params?.[2]).toBe('2026-04-07T08:00:00.000Z');
  });

  it('booking.upsert drops naive recordAt so SQL never gets session-TZ interpretation', async () => {
    const capture = { sqlCalls: [] as string[] };
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
    const call = (db.query as ReturnType<typeof vi.fn>).mock.calls.find((c) =>
      String(c[0]).includes('INSERT INTO public.appointment_records'),
    );
    const params = call?.[1] as unknown[];
    expect(params?.[2]).toBeNull();
  });

  it('event.log booking writes action field as event (not "unknown")', async () => {
    const eventInserts: { externalRecordId: string | null; event: string; payloadJson: unknown }[] = [];
    const query = vi.fn(async (sql: string, params: unknown[]) => {
      if (typeof sql === 'string' && sql.includes('rubitime_events')) {
        const [externalRecordId, event, payloadJsonStr] = params as [string | null, string, string];
        let payloadJson: unknown = {};
        try {
          payloadJson = JSON.parse(payloadJsonStr);
        } catch {
          /* */
        }
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
});
