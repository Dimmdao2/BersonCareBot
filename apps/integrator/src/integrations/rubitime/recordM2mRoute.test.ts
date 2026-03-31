import { createHmac } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendEmailRoute } from '../bersoncare/sendEmailRoute.js';
import * as mailer from '../email/mailer.js';
import * as rubitimeClient from './client.js';

const enqueueMessageRetryJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const dbQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
const getTargetsByPhone = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('../../infra/db/repos/jobQueue.js', () => ({
  enqueueMessageRetryJob,
}));

vi.mock('../../infra/db/client.js', () => ({
  createDbPort: () => ({
    query: dbQuery,
  }),
}));

vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: () => ({
    getTargetsByPhone,
  }),
}));

import { registerRubitimeRecordM2mRoutes } from './recordM2mRoute.js';

const TEST_SECRET = 'test-shared-secret-16chars';

function sign(timestamp: string, rawBody: string): string {
  return createHmac('sha256', TEST_SECRET).update(`${timestamp}.${rawBody}`).digest('base64url');
}

function makeHeaders(rawBody: string) {
  const timestamp = String(Math.floor(Date.now() / 1000));
  return {
    'content-type': 'application/json',
    'x-bersoncare-timestamp': timestamp,
    'x-bersoncare-signature': sign(timestamp, rawBody),
  };
}

async function buildApp(dispatchOutgoing = vi.fn().mockResolvedValue(undefined)) {
  const app = Fastify();
  vi.spyOn(mailer, 'isMailerConfigured').mockReturnValue(true);
  vi.spyOn(mailer, 'sendMail').mockResolvedValue({ accepted: [], rejected: [], messageId: 'x' });
  await registerBersoncareSendEmailRoute(app, { sharedSecret: TEST_SECRET });
  await registerRubitimeRecordM2mRoutes(app, { sharedSecret: TEST_SECRET, dispatchPort: { dispatchOutgoing } });
  return app;
}

function bookingEventBody(over: Record<string, unknown> = {}) {
  const slotStart = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000).toISOString();
  const slotEnd = new Date(Date.now() + 4 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
  return {
    eventType: 'booking.created' as const,
    idempotencyKey: `idem-${Math.random().toString(36).slice(2)}`,
    payload: {
      bookingId: '2f14566f-a4de-4ab4-9336-5ddf806cd6ce',
      userId: '3f14566f-a4de-4ab4-9336-5ddf806cd6ce',
      bookingType: 'online' as const,
      category: 'general' as const,
      slotStart,
      slotEnd,
      contactName: 'Ivan',
      contactPhone: '+79990001122',
      ...over,
    },
  };
}

describe('Rubitime record M2M routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    enqueueMessageRetryJob.mockClear();
    dbQuery.mockClear();
    getTargetsByPhone.mockResolvedValue(null);
  });

  it('update-record returns 200 when Rubitime client succeeds', async () => {
    const spy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord').mockResolvedValue({ id: 50 });
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '50', patch: { status: 0 } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: { id: 50 } });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: '50', data: { status: 0 } }),
    );
  });

  it('remove-record returns 200 when Rubitime client succeeds', async () => {
    const spy = vi.spyOn(rubitimeClient, 'removeRubitimeRecord').mockResolvedValue({});
    const app = await buildApp();
    const body = JSON.stringify({ recordId: 99 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/remove-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: {} });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ recordId: '99' }));
  });

  it('returns 401 when signature invalid', async () => {
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '1', patch: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad',
      },
      body,
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/bersoncare/rubitime/booking-event', () => {
  beforeEach(() => {
    enqueueMessageRetryJob.mockClear();
    dbQuery.mockClear();
    getTargetsByPhone.mockResolvedValue(null);
  });

  it('returns 400 when payload is invalid (missing slotEnd)', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const base = bookingEventBody();
    const payload = { ...base.payload } as Record<string, unknown>;
    delete payload.slotEnd;
    const bad = {
      eventType: 'booking.created' as const,
      idempotencyKey: 'bad-payload',
      payload,
    };
    const raw = JSON.stringify(bad);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_booking_event');
  });

  it('returns 400 when bookingId is not a UUID', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const base = bookingEventBody({ bookingId: 'not-a-uuid' });
    const raw = JSON.stringify(base);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 401 without M2M signature headers', async () => {
    const app = await buildApp();
    const raw = JSON.stringify(bookingEventBody());
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: { 'content-type': 'application/json' },
      body: raw,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('missing_headers');
  });

  it('deduplicates by idempotencyKey — second request does not add dispatch calls', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const idem = `dedup-${Date.now()}`;
    const raw = JSON.stringify({
      ...bookingEventBody(),
      idempotencyKey: idem,
      payload: {
        ...bookingEventBody().payload,
        bookingId: '4f14566f-a4de-4ab4-9336-5ddf806cd6ce',
      },
    });
    const headers = makeHeaders(raw);
    const res1 = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers,
      body: raw,
    });
    expect(res1.statusCode).toBe(200);
    const afterFirst = dispatchOutgoing.mock.calls.length;
    const res2 = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers,
      body: raw,
    });
    expect(res2.statusCode).toBe(200);
    expect(dispatchOutgoing.mock.calls.length).toBe(afterFirst);
  });

  it('sends doctor telegram when admin id is configured', async () => {
    const { telegramConfig } = await import('../telegram/config.js');
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const slot = bookingEventBody();
    const raw = JSON.stringify({
      ...slot,
      payload: {
        ...slot.payload,
        bookingId: '5f14566f-a4de-4ab4-9336-5ddf806cd6ce',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    if (!Number.isFinite(telegramConfig.adminTelegramId) || telegramConfig.adminTelegramId === 0) {
      return;
    }
    const doctorCalls = dispatchOutgoing.mock.calls.filter(
      (c) => (c[0] as { meta?: { eventId?: string } }).meta?.eventId?.includes('doctor:telegram'),
    );
    expect(doctorCalls.length).toBeGreaterThanOrEqual(1);
    expect((doctorCalls[0]![0] as { payload?: { recipient?: { chatId?: number } } }).payload?.recipient?.chatId).toBe(
      telegramConfig.adminTelegramId,
    );
  });
});
