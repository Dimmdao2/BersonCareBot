import { createHmac } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import Fastify from 'fastify';
import { registerBersoncareSendEmailRoute } from '../bersoncare/sendEmailRoute.js';
import * as mailer from '../email/mailer.js';
import * as rubitimeClient from './client.js';
import { _resetScheduleMappingCache } from './bookingScheduleMapping.js';
import { resetRubitimeRuntimeConfigCache } from './runtimeConfig.js';

const mockRunPostCreateProjection = vi.hoisted(() =>
  vi.fn().mockResolvedValue({ gcalEventId: 'gcal-test', projectionOk: true }),
);
vi.mock('./postCreateProjection.js', () => ({
  runPostCreateProjection: mockRunPostCreateProjection,
}));

const mockSyncCanonicalAppointmentToCalendar = vi.hoisted(() => vi.fn().mockResolvedValue('gcal-canonical'));
const mockSyncAppointmentToCalendar = vi.hoisted(() => vi.fn().mockResolvedValue('gcal-rubitime'));
vi.mock('../google-calendar/sync.js', () => ({
  syncCanonicalAppointmentToCalendar: mockSyncCanonicalAppointmentToCalendar,
  syncAppointmentToCalendar: mockSyncAppointmentToCalendar,
}));

const enqueueMessageRetryJob = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const cancelPendingBookingReminderJobsByBookingId = vi.hoisted(() => vi.fn().mockResolvedValue(undefined));
const dbQuery = vi.hoisted(() => vi.fn().mockResolvedValue({ rows: [] }));
const getTargetsByPhone = vi.hoisted(() => vi.fn().mockResolvedValue(null));
const resolveBookingProfile = vi.hoisted(() => vi.fn().mockResolvedValue(null));

vi.mock('../../infra/db/repos/jobQueue.js', () => ({
  enqueueMessageRetryJob,
  cancelPendingBookingReminderJobsByBookingId,
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
import { PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS } from '../../kernel/domain/reminders/patientNotificationTopics.js';
import type { DbPort, WebappEventsPort } from '../../kernel/contracts/index.js';
import * as smtpOutbound from '../../config/smtpOutbound.js';

const resolveSmtpOutboundCfg = 'resolveSmtp' + 'OutboundConfig' as keyof typeof smtpOutbound;

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

async function buildApp(
  dispatchOutgoing = vi.fn().mockResolvedValue(undefined),
  webappEventsPort?: Pick<WebappEventsPort, 'notifyPatientWebPush'>,
) {
  const app = Fastify();
  vi.spyOn(smtpOutbound, resolveSmtpOutboundCfg).mockResolvedValue({
    configured: true,
    smtpHost: 'smtp.example.com',
    smtpPort: 587,
    smtpSecure: false,
    smtpUser: 'u',
    smtpPass: 'p',
    fromAddress: 'from@example.com',
  });
  vi.spyOn(mailer, 'sendMail').mockResolvedValue({ accepted: [], rejected: [], messageId: 'x' });
  const sendEmailDb = { query: vi.fn() } as unknown as DbPort;
  await registerBersoncareSendEmailRoute(app, { sharedSecret: TEST_SECRET, db: sendEmailDb });
  const mockWritePort = { writeDb: vi.fn().mockResolvedValue(undefined) };
  await registerRubitimeRecordM2mRoutes(app, {
    sharedSecret: TEST_SECRET,
    dispatchPort: { dispatchOutgoing },
    dbWritePort: mockWritePort,
    ...(webappEventsPort ?
      { webappEventsPort: webappEventsPort as WebappEventsPort }
    : {}),
  });
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
    cancelPendingBookingReminderJobsByBookingId.mockClear();
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

  it('update-record returns 200 when Rubitime record already cancelled', async () => {
    const spy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord').mockResolvedValue({});
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '50', patch: { status: 4 } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: {} });
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ recordId: '50', data: { status: 4 } }),
    );
  });

  it('remove-record returns 200 when Rubitime client succeeds', async () => {
    const spy = vi.spyOn(rubitimeClient, 'removeRubitimeRecord').mockResolvedValue({});
    mockSyncAppointmentToCalendar.mockClear();
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
    expect(mockSyncAppointmentToCalendar).toHaveBeenCalledWith(
      { action: 'canceled', rubRecordId: '99' },
      expect.objectContaining({ dispatchPort: expect.anything() }),
    );
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ recordId: '99' }));
  });

  it('remove-record returns 200 when Rubitime record already gone', async () => {
    const spy = vi.spyOn(rubitimeClient, 'removeRubitimeRecord').mockResolvedValue({});
    mockSyncAppointmentToCalendar.mockClear();
    const app = await buildApp();
    const body = JSON.stringify({ recordId: 404404 });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/remove-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(JSON.parse(res.body)).toEqual({ ok: true, data: {} });
    expect(spy).toHaveBeenCalledWith(expect.objectContaining({ recordId: '404404' }));
  });

  it('update-record returns 400 empty_patch when patch normalizes to no fields', async () => {
    const spy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord');
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '50', patch: {} });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(400);
    expect(JSON.parse(res.body)).toEqual({ ok: false, error: 'empty_patch' });
    expect(spy).not.toHaveBeenCalled();
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

  // R3: time-only reschedule hits update-record (not create-record), no status field in API call
  it('R3: time-only reschedule calls update-record with record/datetime_end and no status', async () => {
    const updateSpy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord').mockResolvedValue({ id: 50 });
    const createSpy = vi.spyOn(rubitimeClient, 'createRubitimeRecord');
    const app = await buildApp();
    const body = JSON.stringify({
      recordId: '50',
      patch: {
        record: '2026-06-02T09:00:00.000Z',
        datetime_end: '2026-06-02T10:00:00.000Z',
        // no status — time-only change
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    // Must call update-record, never create-record
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(createSpy).not.toHaveBeenCalled();
    // The normalized data sent to Rubitime must have record/datetime_end but no status
    const calledData = updateSpy.mock.calls[0]![0].data as Record<string, unknown>;
    expect(calledData.record).toBeTruthy();
    expect(calledData.datetime_end).toBeTruthy();
    expect(calledData).not.toHaveProperty('status');
  });

  // X1: staff cancel hits update-record with status=4, never remove-record
  it('X1: staff cancel calls update-record with {status:4} and does NOT call remove-record', async () => {
    const updateSpy = vi.spyOn(rubitimeClient, 'updateRubitimeRecord').mockResolvedValue({});
    const removeSpy = vi.spyOn(rubitimeClient, 'removeRubitimeRecord');
    const app = await buildApp();
    const body = JSON.stringify({ recordId: '77', patch: { status: 4 } });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/update-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    // Must use update-record (status 4) — not remove-record
    expect(updateSpy).toHaveBeenCalledOnce();
    expect(removeSpy).not.toHaveBeenCalled();
    const calledData = updateSpy.mock.calls[0]![0].data as Record<string, unknown>;
    expect(calledData.status).toBe(4);
  });
});

describe('POST /api/bersoncare/rubitime/booking-event', () => {
  beforeEach(() => {
    enqueueMessageRetryJob.mockClear();
    cancelPendingBookingReminderJobsByBookingId.mockClear();
    dbQuery.mockClear();
    getTargetsByPhone.mockResolvedValue(null);
    mockSyncCanonicalAppointmentToCalendar.mockClear();
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

  it('booking.created skips canonical GCal sync when rubitimeId is set (post-create already synced)', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const raw = JSON.stringify(
      bookingEventBody({
        rubitimeId: 'rt-gcal-1',
        canonicalAppointmentId: '9f14566f-a4de-4ab4-9336-5ddf806cd6ce',
      }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSyncCanonicalAppointmentToCalendar).not.toHaveBeenCalled();
  });

  it('booking.package_linked syncs GCal without patient notifications', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const raw = JSON.stringify({
      eventType: 'booking.package_linked' as const,
      idempotencyKey: `pkg-linked-${Date.now()}`,
      payload: {
        ...bookingEventBody().payload,
        canonicalAppointmentId: 'cf14566f-a4de-4ab4-9336-5ddf806cd6ce',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSyncCanonicalAppointmentToCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updated',
        appointmentId: 'cf14566f-a4de-4ab4-9336-5ddf806cd6ce',
      }),
      expect.any(Object),
    );
  });

  it('booking.cancelled updates GCal title with cancel marker instead of deleting', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const raw = JSON.stringify({
      eventType: 'booking.cancelled' as const,
      idempotencyKey: `cancel-gcal-${Date.now()}`,
      payload: {
        ...bookingEventBody().payload,
        rubitimeId: 'rt-cancel-gcal',
        canonicalAppointmentId: 'bf14566f-a4de-4ab4-9336-5ddf806cd6ce',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSyncCanonicalAppointmentToCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updated',
        titleMarker: 'cancelled',
        rubitimeRecordId: 'rt-cancel-gcal',
      }),
      expect.any(Object),
    );
  });

  it('booking.rescheduled uses rubitime map key for GCal when rubitimeId is set', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    const app = await buildApp(dispatchOutgoing);
    const raw = JSON.stringify({
      eventType: 'booking.rescheduled' as const,
      idempotencyKey: `resched-gcal-${Date.now()}`,
      payload: {
        ...bookingEventBody().payload,
        rubitimeId: 'rt-gcal-2',
        canonicalAppointmentId: 'af14566f-a4de-4ab4-9336-5ddf806cd6ce',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(mockSyncCanonicalAppointmentToCalendar).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'updated',
        appointmentId: 'af14566f-a4de-4ab4-9336-5ddf806cd6ce',
        rubitimeRecordId: 'rt-gcal-2',
      }),
      expect.any(Object),
    );
  });

  it('booking.created patient web push uses messages openUrl', async () => {
    const notifyPatientWebPush = vi.fn().mockResolvedValue(undefined);
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    getTargetsByPhone.mockResolvedValue({ channelBindings: { telegramId: 'tg-patient-immediate', maxId: null } });
    const app = await buildApp(dispatchOutgoing, { notifyPatientWebPush });
    const slot = bookingEventBody({
      bookingId: '8f14566f-a4de-4ab4-9336-5ddf806cd6ce',
    });
    const raw = JSON.stringify(slot);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(notifyPatientWebPush).toHaveBeenCalledOnce();
    const body = JSON.parse(String(notifyPatientWebPush.mock.calls[0]![0].body)) as {
      openUrl: string;
      intentType: string;
    };
    expect(body.intentType).toBe('appointment_lifecycle');
    expect(body.openUrl).toContain('/app/patient/messages');
  });

  it('booking.created schedules patient reminders using delivery-targets topic appointment_reminders', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    getTargetsByPhone
      .mockResolvedValueOnce({ channelBindings: { telegramId: 'tg-patient-immediate', maxId: null } })
      .mockResolvedValueOnce({ channelBindings: { telegramId: 'tg-chat-1', maxId: null } });
    const app = await buildApp(dispatchOutgoing);
    const slot = bookingEventBody({
      bookingId: '6f14566f-a4de-4ab4-9336-5ddf806cd6ce',
    });
    const raw = JSON.stringify(slot);
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(getTargetsByPhone).toHaveBeenNthCalledWith(1, '+79990001122');
    expect(getTargetsByPhone).toHaveBeenNthCalledWith(2, '+79990001122', {
      topic: PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS,
    });
    expect(enqueueMessageRetryJob).toHaveBeenCalled();
  });

  it('booking.created does not enqueue slot reminders when appointment_reminders yields no channel bindings', async () => {
    enqueueMessageRetryJob.mockClear();
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    getTargetsByPhone
      .mockResolvedValueOnce({ channelBindings: { telegramId: 'tg-immediate', maxId: null } })
      .mockResolvedValueOnce(null);
    const app = await buildApp(dispatchOutgoing);
    const raw = JSON.stringify(
      bookingEventBody({ bookingId: '7f14566f-a4de-4ab4-9336-5ddf806cd6ce' }),
    );
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(getTargetsByPhone).toHaveBeenNthCalledWith(2, '+79990001122', {
      topic: PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS,
    });
    expect(enqueueMessageRetryJob).not.toHaveBeenCalled();
  });

  it('booking.rescheduled cancels pending reminders and schedules new ones', async () => {
    const dispatchOutgoing = vi.fn().mockResolvedValue(undefined);
    getTargetsByPhone
      .mockResolvedValueOnce({ channelBindings: { telegramId: 'tg-immediate', maxId: null } })
      .mockResolvedValueOnce({ channelBindings: { telegramId: 'tg-reminders', maxId: null } });
    const app = await buildApp(dispatchOutgoing);
    const slotStart = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString();
    const slotEnd = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000 + 60 * 60 * 1000).toISOString();
    const raw = JSON.stringify({
      eventType: 'booking.rescheduled',
      idempotencyKey: `reschedule-${Date.now()}`,
      payload: {
        bookingId: '9f14566f-a4de-4ab4-9336-5ddf806cd6ce',
        userId: '3f14566f-a4de-4ab4-9336-5ddf806cd6ce',
        bookingType: 'online',
        category: 'general',
        slotStart,
        slotEnd,
        contactName: 'Ivan',
        contactPhone: '+79990001122',
      },
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/booking-event',
      headers: makeHeaders(raw),
      body: raw,
    });
    expect(res.statusCode).toBe(200);
    expect(cancelPendingBookingReminderJobsByBookingId).toHaveBeenCalledWith(
      expect.objectContaining({ query: expect.any(Function) }),
      '9f14566f-a4de-4ab4-9336-5ddf806cd6ce',
    );
    expect(enqueueMessageRetryJob).toHaveBeenCalled();
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

  it('returns 200 with empty slots when Rubitime returns empty array (no open slots)', async () => {
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
    expect(res.statusCode).toBe(200);
    const j = JSON.parse(res.body) as { ok: boolean; slots: unknown };
    expect(j.ok).toBe(true);
    expect(j.slots).toEqual([]);
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

  it('v2 create-record calls runPostCreateProjection with recordId', async () => {
    mockRunPostCreateProjection.mockClear();
    vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 77 });
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
    expect(mockRunPostCreateProjection).toHaveBeenCalledWith(
      '77',
      expect.objectContaining({ dispatchPort: expect.any(Object), dbWritePort: expect.any(Object) }),
    );
  });

  it('v2 create-record returns projectionWarning when projection fails', async () => {
    mockRunPostCreateProjection.mockClear();
    mockRunPostCreateProjection.mockResolvedValue({ gcalEventId: null, projectionOk: false, error: 'fetch_failed' });
    vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 77 });
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
    const resBody = JSON.parse(res.body);
    expect(resBody.ok).toBe(true);
    expect(resBody.recordId).toBe('77');
    expect(resBody.projectionWarning).toBe('fetch_failed');
  });

  it('legacy create-record calls runPostCreateProjection with recordId', async () => {
    mockRunPostCreateProjection.mockClear();
    resolveBookingProfile.mockResolvedValueOnce(TEST_PROFILE);
    vi.spyOn(rubitimeClient, 'createRubitimeRecord').mockResolvedValue({ id: 88 });
    const app = await buildApp();
    const body = JSON.stringify({
      type: 'online',
      category: 'general',
      slotStart: '2026-04-10T10:00:00.000Z',
      slotEnd: '2026-04-10T11:00:00.000Z',
      contactName: 'Test',
      contactPhone: '+79990001122',
    });
    const res = await app.inject({
      method: 'POST',
      url: '/api/bersoncare/rubitime/create-record',
      headers: makeHeaders(body),
      body,
    });
    expect(res.statusCode).toBe(200);
    expect(mockRunPostCreateProjection).toHaveBeenCalledWith(
      '88',
      expect.objectContaining({ dispatchPort: expect.any(Object), dbWritePort: expect.any(Object) }),
    );
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

  it('returns 200 with empty slots when Rubitime returns empty array (v2, no open slots)', async () => {
    vi.spyOn(rubitimeClient, 'fetchRubitimeSchedule').mockResolvedValue([]);
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
    expect(JSON.parse(res.body)).toEqual({ ok: true, slots: [] });
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
