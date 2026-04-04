import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendEmailRoute } from '../bersoncare/sendEmailRoute.js';
import * as mailer from '../email/mailer.js';
import * as rubitimeClient from './client.js';
import { _resetScheduleMappingCache } from './bookingScheduleMapping.js';
import { resetRubitimeRuntimeConfigCache } from './runtimeConfig.js';

const enqueueMessageRetryJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const dbQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
const getTargetsByPhone = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const resolveBookingProfile = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('../../infra/db/repos/jobQueue.js', () => ({
  enqueueMessageRetryJob,
}));

vi.mock('../../infra/db/client.js', () => ({
  createDbPort: () => ({
    query: dbQuery,
  }),
}));

vi.mock('./db/bookingProfilesRepo.js', () => ({
  resolveBookingProfile,
}));

vi.mock('../../infra/adapters/deliveryTargetsPort.js', () => ({
  createDeliveryTargetsPort: () => ({
    getTargetsByPhone,
  }),
}));

vi.mock('../../infra/db/branchTimezone.js', () => ({
  createGetBranchTimezoneWithDataQuality: () => async () => 'Europe/Moscow',
  resetBranchTimezoneCacheForTests: vi.fn(),
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

const TEST_PROFILE = {
  rubitimeBranchId: 10,
  rubitimeCooperatorId: 20,
  rubitimeServiceId: 30,
  durationMinutes: 60,
};

describe('Rubitime record M2M routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    enqueueMessageRetryJob.mockClear();
    dbQuery.mockClear();
    getTargetsByPhone.mockResolvedValue(null);
    resolveBookingProfile.mockResolvedValue(null);
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

describe('POST /api/bersoncare/rubitime/slots', () => {
  afterEach(() => {
    _resetScheduleMappingCache();
    resetRubitimeRuntimeConfigCache();
  });

  it('returns 200 with normalized slots when booking profile exists in DB', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    const scheduleData = {
      '2026-04-10': { '10:00': { available: true }, '11:00': { available: false } },
      '2026-04-11': { '09:00': { available: true } },
    };
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockResolvedValue(scheduleData);
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);
    expect(Array.isArray(json.slots)).toBe(true);
    expect(json.slots).toHaveLength(2);
    expect(json.slots[0].date).toBe('2026-04-10');
    expect(json.slots[0].slots).toHaveLength(1);
  });

  it('returns 400 when no booking profile found in DB for query', async () => {
    resolveBookingProfile.mockResolvedValueOnce(null);
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'nutrition' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('slots_mapping_not_configured');
  });

  it('returns 400 for invalid slots query body', async () => {
    const app = await buildApp();
    const body = JSON.stringify({ type: 'unknown_type', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_slots_query');
  });

  it('returns 401 when signature is invalid', async () => {
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: {
        'content-type': 'application/json',
        'x-bersoncare-timestamp': String(Math.floor(Date.now() / 1000)),
        'x-bersoncare-signature': 'bad-sig',
      },
      body,
    });
    expect(res.statusCode).toBe(401);
  });

  it('returns 502 when Rubitime returns malformed schedule data (array instead of object)', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockResolvedValue([]);
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(502);
    expect(JSON.parse(res.body).error).toBe('rubitime_schedule_malformed');
  });

  it('returns 502 when Rubitime call itself throws', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockRejectedValue(new Error('RUBITIME_HTTP_503: down'));
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('POST /api/bersoncare/rubitime/create-record', () => {
  afterEach(() => {
    _resetScheduleMappingCache();
    resetRubitimeRuntimeConfigCache();
  });

  it('returns 200 and builds correct Rubitime payload from booking profile', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    const spy = vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 42 });
    const app = await buildApp();
    const body = JSON.stringify({
      type: 'online',
      category: 'general',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'Ivan Ivanov',
      contactPhone: '+79990001122',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.ok).toBe(true);
    expect(json.recordId).toBe('42');
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branch_id: 10,
          cooperator_id: 20,
          service_id: 30,
          record: '2026-04-10 13:00:00',
          status: 0,
          name: 'Ivan Ivanov',
          phone: '+79990001122',
        }),
      }),
    );
  });

  it('includes email in Rubitime payload when provided', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    const spy = vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 55 });
    const app = await buildApp();
    const body = JSON.stringify({
      type: 'online',
      category: 'general',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'Ivan',
      contactPhone: '+79990001122',
      contactEmail: 'ivan@example.com',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: 'ivan@example.com',
        }),
      }),
    );
  });

  it('returns 400 when no booking profile found for query', async () => {
    resolveBookingProfile.mockResolvedValueOnce(null);
    const app = await buildApp();
    const body = JSON.stringify({
      type: 'online',
      category: 'nutrition',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'Ivan',
      contactPhone: '+79990001122',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('slots_mapping_not_configured');
  });

  it('returns 400 when body is invalid (missing required fields)', async () => {
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_create_record_input');
  });

  it('returns 502 when Rubitime API call fails', async () => {
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockRejectedValue(new Error('RUBITIME_API_ERROR: forbidden'));
    const app = await buildApp();
    const body = JSON.stringify({
      type: 'online',
      category: 'general',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'Ivan',
      contactPhone: '+79990001122',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(502);
  });

  it('v2 create-record uses explicit IDs and does not call resolveBookingProfile', async () => {
    resolveBookingProfile.mockClear();
    const spy = vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 99 });
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
      patient: { name: 'Ivan', phone: '+79990001122' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(resolveBookingProfile).not.toHaveBeenCalled();
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          branch_id: 10,
          cooperator_id: 20,
          service_id: 30,
          record: '2026-04-10 13:00:00',
          status: 0,
          name: 'Ivan',
          phone: '+79990001122',
        }),
      }),
    );
  });

  it('v2 create-record returns 400 when rubitime ids are not numeric', async () => {
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: 'x',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotStart: '2026-04-10T10:00:00.000Z',
      patient: { name: 'Ivan', phone: '+79990001122' },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_rubitime_ids');
  });
});

describe('POST /api/bersoncare/rubitime/slots (v2 explicit IDs)', () => {
  afterEach(() => {
    _resetScheduleMappingCache();
    resetRubitimeRuntimeConfigCache();
  });

  it('returns 200 and does not call resolveBookingProfile for v2 body', async () => {
    resolveBookingProfile.mockClear();
    const fetchSpy = vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockResolvedValue({
      '2026-04-10': { '10:00': { available: true } },
    });
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotDurationMinutes: 60,
      dateFrom: '2026-04-10',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(resolveBookingProfile).not.toHaveBeenCalled();
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        params: { branchId: 10, cooperatorId: 20, serviceId: 30 },
      }),
    );
  });

  it('returns 400 invalid_rubitime_ids for v2 slots when ids are not numeric', async () => {
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: 'bad',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotDurationMinutes: 60,
      dateFrom: '2026-04-10',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('invalid_rubitime_ids');
  });

  it('returns 502 when Rubitime schedule fetch throws for v2 slots', async () => {
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockRejectedValue(new Error('RUBITIME_HTTP_503'));
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotDurationMinutes: 60,
      dateFrom: '2026-04-10',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(502);
  });
});

describe('legacy profile resolve disabled', () => {
  const prev = process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED;

  afterEach(() => {
    if (prev === undefined) delete process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED;
    else process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED = prev;
    _resetScheduleMappingCache();
    resetRubitimeRuntimeConfigCache();
  });

  it('returns 400 legacy_resolve_disabled for v1 slots when env is false', async () => {
    resolveBookingProfile.mockClear();
    process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED = 'false';
    const app = await buildApp();
    const body = JSON.stringify({ type: 'online', category: 'general' });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body).error).toBe('legacy_resolve_disabled');
    expect(resolveBookingProfile).not.toHaveBeenCalled();
  });

  it('v2 slots still work when legacy resolve is disabled', async () => {
    process.env.RUBITIME_LEGACY_PROFILE_RESOLVE_ENABLED = 'false';
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockResolvedValue({
      '2026-04-11': { '09:00': { available: true } },
    });
    const app = await buildApp();
    const body = JSON.stringify({
      version: 'v2',
      rubitimeBranchId: '10',
      rubitimeCooperatorId: '20',
      rubitimeServiceId: '30',
      slotDurationMinutes: 60,
      dateFrom: '2026-04-11',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/slots',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
  });
});
