/**
 * M2M от webapp: обновление / отмена записи Rubitime (api2/update-record, remove-record).
 * Подпись как у send-sms / send-email.
 */
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { logger } from '../../infra/observability/logger.js';
import { createDbPort } from '../../infra/db/client.js';
import { enqueueMessageRetryJob } from '../../infra/db/repos/jobQueue.js';
import { createDeliveryTargetsPort } from '../../infra/adapters/deliveryTargetsPort.js';
import type { DispatchPort } from '../../kernel/contracts/index.js';
import { createRubitimeRecord, fetchRubitimeSchedule, removeRubitimeRecord, updateRubitimeRecord } from './client.js';
import { resolveScheduleParams } from './bookingScheduleMapping.js';
import { normalizeRubitimeSchedule } from './scheduleNormalizer.js';
import { getBookingDisplayTimezone } from '../../infra/db/repos/bookingDisplayTimezone.js';
import { formatBookingRuDateTime } from './bookingNotificationFormat.js';
import {
  parseBookingLifecycleEvent,
  parseRubitimeSlotsQuery,
  type BookingLifecycleEventValidated,
  type BookingLifecyclePayloadValidated,
} from './schema.js';
import { telegramConfig } from '../telegram/config.js';
import { maxConfig } from '../max/config.js';

const WINDOW_SECONDS = 300;

type ReqWithRawBody = FastifyRequest & { rawBody?: string };

function verifySignature(timestamp: string, rawBody: string, signature: string, secret: string): boolean {
  const ts = Number(timestamp);
  if (!Number.isFinite(ts)) return false;
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - ts) > WINDOW_SECONDS) return false;
  const payload = `${timestamp}.${rawBody}`;
  const expected = createHmac('sha256', secret).update(payload).digest('base64url');
  const left = Buffer.from(expected);
  const right = Buffer.from(signature);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseJsonRecordId(body: unknown): string | null {
  if (typeof body !== 'object' || body === null) return null;
  const id = (body as Record<string, unknown>).recordId;
  if (typeof id === 'number' && Number.isFinite(id)) return String(Math.trunc(id));
  if (typeof id === 'string' && id.trim().length > 0) return id.trim();
  return null;
}


export type RubitimeRecordM2mDeps = {
  sharedSecret: string;
  dispatchPort: DispatchPort;
};

const bookingEventDedup = new Map<string, number>();
const BOOKING_EVENT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

function isBookingEventDuplicate(key: string): boolean {
  const exp = bookingEventDedup.get(key);
  if (exp === undefined) return false;
  if (Date.now() > exp) {
    bookingEventDedup.delete(key);
    return false;
  }
  return true;
}

function rememberBookingEventKey(key: string): void {
  bookingEventDedup.set(key, Date.now() + BOOKING_EVENT_DEDUP_TTL_MS);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function patientCreatedText(payload: BookingLifecyclePayloadValidated, timeZone: string): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const typeLabel = payload.bookingType === 'online' ? 'Онлайн' : 'Очный приём';
  const city = asNonEmptyString(payload.city);
  const citySuffix = city ? ` (${city})` : '';
  return `Запись подтверждена: ${dateLabel}\n${typeLabel}${citySuffix}`;
}

function patientCancelledText(payload: BookingLifecyclePayloadValidated, timeZone: string): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const reason = asNonEmptyString(payload.reason);
  return reason
    ? `Запись на ${dateLabel} отменена.\nПричина: ${reason}`
    : `Запись на ${dateLabel} отменена.`;
}

function doctorCreatedText(payload: BookingLifecyclePayloadValidated, timeZone: string): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const name = asNonEmptyString(payload.contactName) ?? 'Пациент';
  const phone = asNonEmptyString(payload.contactPhone) ?? 'без телефона';
  return `Новая запись: ${name}, ${phone}\nДата: ${dateLabel}`;
}

function doctorCancelledText(payload: BookingLifecyclePayloadValidated, timeZone: string): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const name = asNonEmptyString(payload.contactName) ?? 'Пациент';
  return `Отмена записи: ${name}\nДата: ${dateLabel}`;
}

async function sendLinkedChannelMessage(input: {
  dispatchPort: DispatchPort;
  phoneNormalized: string | null;
  text: string;
  eventId: string;
}): Promise<void> {
  if (!input.phoneNormalized) return;
  const deliveryTargets = createDeliveryTargetsPort();
  const bindings = await deliveryTargets.getTargetsByPhone(input.phoneNormalized);
  if (!bindings) return;

  if (typeof bindings.telegramId === 'string' && bindings.telegramId.trim()) {
    await input.dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: {
        eventId: `${input.eventId}:telegram`,
        occurredAt: new Date().toISOString(),
        source: 'telegram',
      },
      payload: {
        recipient: { chatId: bindings.telegramId.trim() },
        message: { text: input.text },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });
  }
  if (typeof bindings.maxId === 'string' && bindings.maxId.trim()) {
    await input.dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: {
        eventId: `${input.eventId}:max`,
        occurredAt: new Date().toISOString(),
        source: 'max',
      },
      payload: {
        recipient: { chatId: bindings.maxId.trim() },
        message: { text: input.text },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    });
  }
}

async function sendDoctorMessage(dispatchPort: DispatchPort, text: string, eventId: string): Promise<void> {
  if (typeof telegramConfig.adminTelegramId === 'number' && Number.isFinite(telegramConfig.adminTelegramId)) {
    await dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: {
        eventId: `${eventId}:doctor:telegram`,
        occurredAt: new Date().toISOString(),
        source: 'telegram',
      },
      payload: {
        recipient: { chatId: telegramConfig.adminTelegramId },
        message: { text },
        delivery: { channels: ['telegram'], maxAttempts: 1 },
      },
    });
  }
  if (typeof maxConfig.adminChatId === 'number' && Number.isFinite(maxConfig.adminChatId)) {
    await dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: {
        eventId: `${eventId}:doctor:max`,
        occurredAt: new Date().toISOString(),
        source: 'max',
      },
      payload: {
        recipient: { chatId: maxConfig.adminChatId },
        message: { text },
        delivery: { channels: ['max'], maxAttempts: 1 },
      },
    });
  }
}

async function cancelPendingBookingReminders(bookingId: string): Promise<void> {
  const db = createDbPort();
  await db.query(
    `UPDATE rubitime_create_retry_jobs
        SET status = 'dead',
            last_error = 'booking_cancelled',
            updated_at = now()
      WHERE status IN ('pending', 'processing')
        AND kind = 'message.deliver'
        AND payload_json -> 'booking' ->> 'bookingId' = $1`,
    [bookingId],
  );
}

async function scheduleBookingReminders(input: {
  bookingId: string;
  slotStartIso: string;
  phoneNormalized: string | null;
  patientName: string | null;
  timeZone: string;
}): Promise<void> {
  const deliveryTargets = createDeliveryTargetsPort();
  const bindings = input.phoneNormalized
    ? await deliveryTargets.getTargetsByPhone(input.phoneNormalized)
    : null;
  if (!bindings) return;

  const targets: Array<{ resource: string; address: Record<string, unknown> }> = [];
  if (typeof bindings.telegramId === 'string' && bindings.telegramId.trim()) {
    targets.push({ resource: 'telegram', address: { chatId: bindings.telegramId.trim() } });
  }
  if (typeof bindings.maxId === 'string' && bindings.maxId.trim()) {
    targets.push({ resource: 'max', address: { chatId: bindings.maxId.trim() } });
  }
  if (targets.length === 0) return;

  const startMs = Date.parse(input.slotStartIso);
  if (!Number.isFinite(startMs)) return;
  const db = createDbPort();
  const patientLabel = input.patientName ?? 'Пациент';
  const dateLabel = formatBookingRuDateTime(input.slotStartIso, input.timeZone);
  const reminders = [
    { code: '24h', offsetMs: 24 * 60 * 60 * 1000, text: `Напоминание: приём ${dateLabel} (через 24 часа).` },
    { code: '2h', offsetMs: 2 * 60 * 60 * 1000, text: `Напоминание: приём ${dateLabel} (через 2 часа).` },
  ];

  for (const reminder of reminders) {
    const runAtMs = startMs - reminder.offsetMs;
    const delaySec = Math.floor((runAtMs - Date.now()) / 1000);
    if (delaySec <= 0) continue;
    const channels = targets.map((x) => x.resource);
    const payloadJson = {
      intent: {
        type: 'message.send',
        meta: {
          eventId: `booking-reminder:${input.bookingId}:${reminder.code}`,
          occurredAt: new Date().toISOString(),
          source: 'worker',
        },
        payload: {
          message: { text: `${patientLabel}, ${reminder.text}` },
          delivery: { channels, maxAttempts: 1 },
        },
      },
      targets,
      retry: { maxAttempts: 2, backoffSeconds: [60] },
      booking: { bookingId: input.bookingId, reminderCode: reminder.code },
    };
    await enqueueMessageRetryJob(db, {
      phoneNormalized: input.phoneNormalized,
      messageText: `${patientLabel}, ${reminder.text}`,
      firstTryDelaySeconds: delaySec,
      maxAttempts: 2,
      kind: 'message.deliver',
      payloadJson,
    });
  }
}

async function handleBookingLifecycleEvent(
  body: BookingLifecycleEventValidated,
  dispatchPort: DispatchPort,
): Promise<void> {
  const { payload, eventType } = body;
  const bookingId = payload.bookingId;
  const contactPhone = asNonEmptyString(payload.contactPhone);
  const patientName = asNonEmptyString(payload.contactName);
  const dedupKey = asNonEmptyString(body.idempotencyKey) ?? `${eventType}:${bookingId}`;
  if (isBookingEventDuplicate(dedupKey)) return;

  const dbPort = createDbPort();
  const timeZone = await getBookingDisplayTimezone(dbPort);

  if (eventType === 'booking.created') {
    const patientText = patientCreatedText(payload, timeZone);
    await sendLinkedChannelMessage({
      dispatchPort,
      phoneNormalized: contactPhone,
      text: patientText,
      eventId: `booking-created:${bookingId}`,
    });
    await sendDoctorMessage(dispatchPort, doctorCreatedText(payload, timeZone), `booking-created:${bookingId}`);
    await cancelPendingBookingReminders(bookingId);
    await scheduleBookingReminders({
      bookingId,
      slotStartIso: payload.slotStart,
      phoneNormalized: contactPhone,
      patientName,
      timeZone,
    });
    rememberBookingEventKey(dedupKey);
    return;
  }

  if (eventType === 'booking.cancelled') {
    await cancelPendingBookingReminders(bookingId);
    const patientText = patientCancelledText(payload, timeZone);
    await sendLinkedChannelMessage({
      dispatchPort,
      phoneNormalized: contactPhone,
      text: patientText,
      eventId: `booking-cancelled:${bookingId}`,
    });
    await sendDoctorMessage(dispatchPort, doctorCancelledText(payload, timeZone), `booking-cancelled:${bookingId}`);
    rememberBookingEventKey(dedupKey);
    return;
  }

  throw new Error('unsupported_booking_event_type');
}

export async function registerRubitimeRecordM2mRoutes(
  app: FastifyInstance,
  deps: RubitimeRecordM2mDeps,
): Promise<void> {
  const { sharedSecret, dispatchPort } = deps;

  const guard = (request: FastifyRequest): { ok: true; rawBody: string } | { ok: false; code: number; err: string } => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return { ok: false, code: 400, err: 'missing_headers' };
    }
    if (!sharedSecret) {
      logger.warn({}, 'rubitime m2m: webhook secret not set');
      return { ok: false, code: 503, err: 'service_unconfigured' };
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return { ok: false, code: 401, err: 'invalid_signature' };
    }
    return { ok: true, rawBody };
  };

  app.post('/api/bersoncare/rubitime/update-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    const patch =
      typeof request.body === 'object' && request.body !== null && 'patch' in request.body
        ? (request.body as { patch?: unknown }).patch
        : null;
    const data =
      typeof patch === 'object' && patch !== null && !Array.isArray(patch)
        ? (patch as Record<string, unknown>)
        : {};
    try {
      const result = await updateRubitimeRecord({ recordId, data });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime update-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/remove-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const recordId = parseJsonRecordId(request.body);
    if (!recordId) {
      return reply.code(400).send({ ok: false, error: 'recordId required' });
    }
    try {
      const result = await removeRubitimeRecord({ recordId });
      return reply.code(200).send({ ok: true, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err, recordId }, 'rubitime remove-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/create-record', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const data = typeof request.body === 'object' && request.body !== null
      ? (request.body as Record<string, unknown>)
      : {};
    try {
      const result = await createRubitimeRecord({ data });
      const recordId = (typeof result.id === 'string' || typeof result.id === 'number')
        ? String(result.id)
        : null;
      return reply.code(200).send({ ok: true, recordId, data: result });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'rubitime create-record failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/slots', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const parsed = parseRubitimeSlotsQuery(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ ok: false, error: 'invalid_slots_query' });
    }
    const scheduleParams = await resolveScheduleParams({
      type: parsed.data.type,
      category: parsed.data.category,
      ...(parsed.data.city ? { city: parsed.data.city } : {}),
    });
    if (!scheduleParams) {
      logger.warn({ query: parsed.data }, 'rubitime slots: no schedule mapping for query');
      return reply.code(400).send({ ok: false, error: 'slots_mapping_not_configured' });
    }
    try {
      const raw = await fetchRubitimeSchedule({ params: scheduleParams });
      const slots = normalizeRubitimeSchedule(raw, scheduleParams.durationMinutes, parsed.data.date);
      return reply.code(200).send({ ok: true, slots });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.startsWith('RUBITIME_SCHEDULE_MALFORMED_DATA')) {
        logger.warn({ err }, 'rubitime slots: malformed schedule data from Rubitime API');
        return reply.code(502).send({ ok: false, error: 'rubitime_schedule_malformed' });
      }
      logger.warn({ err }, 'rubitime slots failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });

  app.post('/api/bersoncare/rubitime/booking-event', async (request, reply) => {
    const g = guard(request);
    if (!g.ok) {
      return reply.code(g.code).send({ ok: false, error: g.err });
    }
    const parsed = parseBookingLifecycleEvent(request.body);
    if (!parsed.success) {
      logger.warn({ err: parsed.error.flatten() }, 'rubitime booking-event validation failed');
      return reply.code(400).send({ ok: false, error: 'invalid_booking_event' });
    }
    try {
      await handleBookingLifecycleEvent(parsed.data, dispatchPort);
      return reply.code(200).send({ ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      logger.warn({ err }, 'rubitime booking-event failed');
      return reply.code(502).send({ ok: false, error: msg });
    }
  });
}
