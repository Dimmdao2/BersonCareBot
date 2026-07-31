import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../infra/observability/logger.js';
import { env } from '../../config/env.js';
import { createDbPort } from '../../infra/db/client.js';
import {
  cancelPendingBookingReminderJobsByBookingId,
  enqueueMessageRetryJob,
} from '../../infra/db/repos/jobQueue.js';
import { createDeliveryTargetsPort } from '../../infra/adapters/deliveryTargetsPort.js';
import { PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS } from '../../kernel/domain/reminders/patientNotificationTopics.js';
import type {
  DbWritePort,
  DispatchPort,
  IdempotencyPort,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { getAppDisplayTimezone } from '../../config/appTimezone.js';
import { maxUserRecipient } from '../max/maxRecipient.js';
import { telegramConfig } from '../telegram/config.js';
import { maxConfig } from '../max/config.js';
import { normalizeRuPhoneE164 } from '../../infra/phone/normalizeRuPhoneE164.js';
import {
  syncCanonicalAppointmentToCalendar,
  type GoogleCalendarTitleMarker,
} from '../google-calendar/sync.js';
import { formatBookingRuDateTime } from './bookingNotificationFormat.js';
import {
  parseBookingLifecycleEvent,
  type BookingLifecycleEventValidated,
  type BookingLifecyclePayloadValidated,
} from './bookingLifecycleSchema.js';

const WINDOW_SECONDS = 300;
const BOOKING_EVENT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;
const bookingEventDedup = new Map<string, number>();

type ReqWithRawBody = FastifyRequest & { rawBody?: string };

export type BookingLifecycleRouteDeps = {
  sharedSecret: string;
  dispatchPort: DispatchPort;
  dbWritePort: DbWritePort;
  idempotencyPort?: IdempotencyPort;
  webappEventsPort?: WebappEventsPort;
};

export type SignedRequestGuard = (
  request: FastifyRequest,
) => { ok: true; rawBody: string } | { ok: false; code: number; err: string };

function verifySignature(
  timestamp: string,
  rawBody: string,
  signature: string,
  secret: string,
): boolean {
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

export function createSignedRequestGuard(
  sharedSecret: string,
  routeLabel: string,
): SignedRequestGuard {
  return (request) => {
    const req = request as ReqWithRawBody;
    const rawBody = req.rawBody ?? JSON.stringify(request.body ?? {});
    const timestamp = request.headers['x-bersoncare-timestamp'];
    const signature = request.headers['x-bersoncare-signature'];
    if (typeof timestamp !== 'string' || typeof signature !== 'string') {
      return { ok: false, code: 400, err: 'missing_headers' };
    }
    if (!sharedSecret) {
      logger.warn({}, `${routeLabel}: webhook secret not set`);
      return { ok: false, code: 503, err: 'service_unconfigured' };
    }
    if (!verifySignature(timestamp, rawBody, signature, sharedSecret)) {
      return { ok: false, code: 401, err: 'invalid_signature' };
    }
    return { ok: true, rawBody };
  };
}

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

function lifecycleDedupStorageKey(input: {
  eventType: BookingLifecycleEventValidated['eventType'];
  eventId: string;
  payload: BookingLifecyclePayloadValidated;
}): string {
  const appointmentOrBookingId =
    asNonEmptyString(input.payload.canonicalAppointmentId) ?? input.payload.bookingId;
  return `booking-lifecycle:${input.eventType}:${appointmentOrBookingId}:${input.eventId}`.slice(
    0,
    240,
  );
}

async function acquireBookingLifecycleKey(
  input: {
    eventType: BookingLifecycleEventValidated['eventType'];
    eventId: string;
    payload: BookingLifecyclePayloadValidated;
  },
  idempotencyPort?: IdempotencyPort,
): Promise<{ acquired: boolean; storageKey: string; persistent: boolean }> {
  const storageKey = lifecycleDedupStorageKey(input);
  if (idempotencyPort) {
    return {
      acquired: await idempotencyPort.tryAcquire(storageKey, BOOKING_EVENT_DEDUP_TTL_MS / 1000),
      storageKey,
      persistent: true,
    };
  }
  if (isBookingEventDuplicate(storageKey)) {
    return { acquired: false, storageKey, persistent: false };
  }
  rememberBookingEventKey(storageKey);
  return { acquired: true, storageKey, persistent: false };
}

async function releaseBookingLifecycleKey(
  acquired: { acquired: boolean; storageKey: string; persistent: boolean },
  idempotencyPort?: IdempotencyPort,
): Promise<void> {
  if (!acquired.acquired) return;
  if (acquired.persistent) {
    await idempotencyPort?.release?.(acquired.storageKey);
    return;
  }
  bookingEventDedup.delete(acquired.storageKey);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function patientCreatedText(payload: BookingLifecyclePayloadValidated, timeZone: string): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const typeLabel = payload.bookingType === 'online' ? 'Онлайн' : 'Очный приём';
  const city = asNonEmptyString(payload.cityCodeSnapshot) ?? asNonEmptyString(payload.city);
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

function patientRescheduledText(
  payload: BookingLifecyclePayloadValidated,
  timeZone: string,
): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const typeLabel = payload.bookingType === 'online' ? 'Онлайн' : 'Очный приём';
  return `Запись перенесена на ${dateLabel}\n${typeLabel}`;
}

function doctorRescheduledText(
  payload: BookingLifecyclePayloadValidated,
  timeZone: string,
): string {
  const dateLabel = formatBookingRuDateTime(payload.slotStart, timeZone);
  const name = asNonEmptyString(payload.contactName) ?? 'Пациент';
  const phone = asNonEmptyString(payload.contactPhone) ?? 'без телефона';
  return `Перенос записи: ${name}, ${phone}\nНовая дата: ${dateLabel}`;
}

async function sendLinkedChannelMessage(input: {
  dispatchPort: DispatchPort;
  phoneNormalized: string | null;
  text: string;
  eventId: string;
}): Promise<void> {
  if (!input.phoneNormalized) return;
  const deliveryTargets = createDeliveryTargetsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const fetched = await deliveryTargets.getTargetsByPhone(input.phoneNormalized);
  const bindings = fetched?.channelBindings;
  if (!bindings) {
    // D-b: пустая аудитория не бывает тихим успехом. Счётчик живёт в webapp и отсюда
    // недостижим, поэтому здесь оставлен структурированный след с тем же именем события.
    logger.warn(
      {
        scope: 'notification_delivery',
        event: 'notification_audience_empty',
        topic: 'booking_linked_channel_message',
        severity: 'user_facing',
      },
      'booking confirmation had no delivery target',
    );
    return;
  }

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
        delivery: { channels: ['telegram'], maxAttempts: 3 },
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
        recipient: maxUserRecipient(bindings.maxId.trim()),
        message: { text: input.text },
        delivery: { channels: ['max'], maxAttempts: 3 },
      },
    });
  }
}

async function sendDoctorMessage(
  dispatchPort: DispatchPort,
  text: string,
  eventId: string,
): Promise<void> {
  if (
    typeof telegramConfig.adminTelegramId === 'number' &&
    Number.isFinite(telegramConfig.adminTelegramId)
  ) {
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
        delivery: { channels: ['telegram'], maxAttempts: 3 },
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
        delivery: { channels: ['max'], maxAttempts: 3 },
      },
    });
  }
}

async function cancelPendingBookingReminders(bookingId: string): Promise<void> {
  const db = createDbPort();
  await cancelPendingBookingReminderJobsByBookingId(db, bookingId);
}

/** D14(1): webapp's explicit `false` skips the cancel; absent field keeps the old always-cancel default. */
function shouldCancelPendingReminders(payload: BookingLifecyclePayloadValidated): boolean {
  return payload.cancelPendingReminders !== false;
}

/** D14(2): webapp's field (including explicit `null`) wins; absent field keeps the old per-event default. */
function resolvePatientPushVariant(
  payload: BookingLifecyclePayloadValidated,
  defaultVariant: 'created' | 'cancelled' | 'rescheduled',
): 'created' | 'cancelled' | 'rescheduled' | null {
  return payload.patientPushVariant !== undefined ? payload.patientPushVariant : defaultVariant;
}

// D14(3): текст пациентского сообщения решает ВЕБАПП. Прислал непустой — уходит он дословно,
// без склейки и дополнений. Поля нет — прежний текст интегратора бит в бит (условие безопасности
// переноса; рез старого пути — отдельным пунктом D13b).
function resolvePatientMessageText(
  payload: BookingLifecyclePayloadValidated,
  fallbackText: string,
): string {
  return asNonEmptyString(payload.patientMessageText) ?? fallbackText;
}

/** D14(4): webapp's explicit `false` skips notifying the doctor; absent field keeps the old always-notify default. */
function shouldNotifyDoctor(payload: BookingLifecyclePayloadValidated): boolean {
  return payload.doctorNotify !== false;
}

// D14(4): текст врачебного уведомления решает ВЕБАПП, той же дисциплиной, что и D14(3) для
// пациента — прислал непустой, уходит дословно; поля нет — прежний текст интегратора бит в бит.
function resolveDoctorMessageText(
  payload: BookingLifecyclePayloadValidated,
  fallbackText: string,
): string {
  return asNonEmptyString(payload.doctorMessageText) ?? fallbackText;
}

/** D14(5): webapp's calendar action/marker win when present; absent keeps the old per-event-type computation. */
function resolveCalendarAction(
  payload: BookingLifecyclePayloadValidated,
  computed: 'created' | 'updated' | 'canceled',
): 'created' | 'updated' | 'canceled' {
  return payload.calendarAction ?? computed;
}

function resolveCalendarTitleMarker(
  payload: BookingLifecyclePayloadValidated,
  computed: GoogleCalendarTitleMarker,
): GoogleCalendarTitleMarker {
  return payload.calendarTitleMarker ?? computed;
}

export async function scheduleBookingReminders(input: {
  organizationId?: string;
  bookingId: string;
  slotStartIso: string;
  phoneNormalized: string | null;
  patientName: string | null;
  timeZone: string;
  webappEventsPort?: WebappEventsPort;
  reminderPlan?: { enabled: boolean; offsetsMinutes: number[] };
}): Promise<void> {
  if (input.reminderPlan?.enabled === false) return;
  const deliveryTargets = createDeliveryTargetsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const fetched = input.phoneNormalized
    ? await deliveryTargets.getTargetsByPhone(input.phoneNormalized, {
        topic: PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS,
      })
    : null;
  const bindings = fetched?.channelBindings;
  if (!bindings) {
    logger.warn(
      {
        scope: 'notification_delivery',
        event: 'notification_audience_empty',
        topic: 'booking_reminder_scheduling',
        severity: 'user_facing',
        reason: 'no_bindings',
      },
      'appointment reminders not scheduled: no delivery target',
    );
    return;
  }

  const targets: Array<{ resource: string; address: Record<string, unknown> }> = [];
  if (typeof bindings.telegramId === 'string' && bindings.telegramId.trim()) {
    targets.push({ resource: 'telegram', address: { chatId: bindings.telegramId.trim() } });
  }
  if (typeof bindings.maxId === 'string' && bindings.maxId.trim()) {
    targets.push({ resource: 'max', address: maxUserRecipient(bindings.maxId.trim()) });
  }
  if (targets.length === 0) {
    logger.warn(
      {
        scope: 'notification_delivery',
        event: 'notification_audience_empty',
        topic: 'booking_reminder_scheduling',
        severity: 'user_facing',
        reason: 'no_messenger_binding',
      },
      'appointment reminders not scheduled: resolvable phone but no messenger binding',
    );
    return;
  }

  const startMs = Date.parse(input.slotStartIso);
  if (!Number.isFinite(startMs)) return;
  const db = createDbPort();
  const patientLabel = input.patientName ?? 'Пациент';
  const dateLabel = formatBookingRuDateTime(input.slotStartIso, input.timeZone);
  const legacyReminders = [
    {
      code: '24h',
      offsetMs: 24 * 60 * 60 * 1000,
      text: `Напоминание: приём ${dateLabel} (через 24 часа).`,
    },
    {
      code: '2h',
      offsetMs: 2 * 60 * 60 * 1000,
      text: `Напоминание: приём ${dateLabel} (через 2 часа).`,
    },
  ];
  const reminders = input.reminderPlan
    ? input.reminderPlan.offsetsMinutes.map((offsetMinutes) => ({
        code: `${offsetMinutes}m`,
        offsetMs: offsetMinutes * 60 * 1000,
        text: `Напоминание: приём ${dateLabel} (через ${offsetMinutes} мин.).`,
      }))
    : legacyReminders;

  for (const reminder of reminders) {
    const runAtMs = startMs - reminder.offsetMs;
    if (runAtMs <= Date.now()) continue;
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
      webappPushNotify: {
        ...(input.organizationId ? { organizationId: input.organizationId } : {}),
        phoneNormalized: input.phoneNormalized,
        slotStartIso: input.slotStartIso,
        stableKey: `booking-reminder:${input.bookingId}:${reminder.code}`,
      },
    };
    await enqueueMessageRetryJob(db, {
      phoneNormalized: input.phoneNormalized,
      messageText: `${patientLabel}, ${reminder.text}`,
      firstTryDelaySeconds: 0,
      firstTryAt: new Date(runAtMs).toISOString(),
      maxAttempts: 2,
      kind: 'message.deliver',
      payloadJson,
    });
  }
}

async function sendBookingWebPush(input: {
  organizationId?: string;
  webappEventsPort?: WebappEventsPort;
  phoneNormalized: string | null;
  intentType: 'appointment_lifecycle' | 'appointment_reminder';
  slotStartIso: string;
  stableKey: string;
  variant?: 'created' | 'cancelled' | 'rescheduled';
  nowIso?: string;
}): Promise<void> {
  if (
    !input.webappEventsPort?.notifyPatientWebPush ||
    !input.phoneNormalized ||
    !input.organizationId
  )
    return;
  const base = env.APP_BASE_URL.replace(/\/$/, '');
  const openUrl =
    input.intentType === 'appointment_lifecycle'
      ? `${base}/app/patient/messages`
      : `${base}/app/patient/booking`;
  const body = JSON.stringify({
    organizationId: input.organizationId,
    phoneNormalized: input.phoneNormalized,
    topicCode: PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS,
    intentType: input.intentType,
    ...(input.variant ? { variant: input.variant } : {}),
    slotStartIso: input.slotStartIso,
    openUrl,
    stableKey: input.stableKey,
    ...(input.nowIso ? { nowIso: input.nowIso } : {}),
  });
  try {
    await input.webappEventsPort.notifyPatientWebPush({
      body,
      idempotencyKey: `pwp:${input.stableKey}`.slice(0, 240),
    });
  } catch (err) {
    logger.warn({ err, stableKey: input.stableKey }, 'booking web push notify failed');
  }
}

async function trySyncCanonicalBookingToGoogleCalendar(
  eventType: BookingLifecycleEventValidated['eventType'],
  payload: BookingLifecyclePayloadValidated,
  dispatchPort: DispatchPort,
): Promise<void> {
  const appointmentId = payload.canonicalAppointmentId;
  if (eventType === 'booking.deleted') {
    if (appointmentId) {
      try {
        await syncCanonicalAppointmentToCalendar(
          {
            action: resolveCalendarAction(payload, 'canceled'),
            appointmentId,
            organizationId: payload.organizationId ?? '',
            startAt: payload.slotStart,
            endAt: payload.slotEnd,
            clientName: payload.contactName,
            serviceTitle: payload.serviceTitleSnapshot ?? null,
            phoneNormalized: normalizeRuPhoneE164(payload.contactPhone),
          },
          { dispatchPort, db: createDbPort() },
        );
      } catch (err) {
        logger.warn({ err, appointmentId, eventType }, 'canonical GCal delete failed');
      }
      return;
    }
    return;
  }

  if (!appointmentId) return;
  const computedAction =
    eventType === 'booking.rescheduled' ||
    eventType === 'booking.payment_captured' ||
    eventType === 'booking.cancelled' ||
    eventType === 'booking.reschedule_requested' ||
    eventType === 'booking.package_linked' ||
    eventType === 'booking.package_unlinked'
      ? 'updated'
      : 'created';
  const computedTitleMarker =
    eventType === 'booking.cancelled'
      ? 'cancelled'
      : eventType === 'booking.reschedule_requested'
        ? 'reschedule_pending'
        : 'none';
  try {
    await syncCanonicalAppointmentToCalendar(
      {
        action: resolveCalendarAction(payload, computedAction),
        appointmentId,
        organizationId: payload.organizationId ?? '',
        startAt: payload.slotStart,
        endAt: payload.slotEnd,
        clientName: payload.contactName,
        serviceTitle: payload.serviceTitleSnapshot ?? null,
        phoneNormalized: normalizeRuPhoneE164(payload.contactPhone),
        titleMarker: resolveCalendarTitleMarker(payload, computedTitleMarker),
      },
      { dispatchPort, db: createDbPort() },
    );
  } catch (err) {
    logger.warn({ err, appointmentId, eventType }, 'canonical GCal sync failed');
  }
}

export async function handleBookingLifecycleEvent(
  body: BookingLifecycleEventValidated,
  dispatchPort: DispatchPort,
  options: {
    idempotencyPort?: IdempotencyPort;
    webappEventsPort?: WebappEventsPort;
  } = {},
): Promise<void> {
  const { payload, eventType } = body;
  const bookingId = payload.bookingId;
  const contactPhone = asNonEmptyString(payload.contactPhone);
  const patientName = asNonEmptyString(payload.contactName);
  const dedupKey = asNonEmptyString(body.idempotencyKey) ?? `${eventType}:${bookingId}`;
  const acquiredKey = await acquireBookingLifecycleKey(
    { eventType, eventId: dedupKey, payload },
    options.idempotencyPort,
  );
  if (!acquiredKey.acquired) return;
  const webappEventsPort = options.webappEventsPort;

  try {
    const dbPort = createDbPort();
    const timeZone = await getAppDisplayTimezone({ db: dbPort, dispatchPort });

    if (eventType === 'booking.created') {
      const patientText = resolvePatientMessageText(payload, patientCreatedText(payload, timeZone));
      await sendLinkedChannelMessage({
        dispatchPort,
        phoneNormalized: contactPhone,
        text: patientText,
        eventId: `booking-created:${bookingId}`,
      });
      if (shouldNotifyDoctor(payload)) {
        await sendDoctorMessage(
          dispatchPort,
          resolveDoctorMessageText(payload, doctorCreatedText(payload, timeZone)),
          `booking-created:${bookingId}`,
        );
      }
      if (shouldCancelPendingReminders(payload)) {
        await cancelPendingBookingReminders(bookingId);
      }
      await scheduleBookingReminders({
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        bookingId,
        slotStartIso: payload.slotStart,
        phoneNormalized: contactPhone,
        patientName,
        timeZone,
        ...(webappEventsPort ? { webappEventsPort } : {}),
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
      });
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.cancelled') {
      if (shouldCancelPendingReminders(payload)) {
        await cancelPendingBookingReminders(bookingId);
      }
      if (payload.suppressPatientNotification !== true) {
        const patientText = resolvePatientMessageText(payload, patientCancelledText(payload, timeZone));
        await sendLinkedChannelMessage({
          dispatchPort,
          phoneNormalized: contactPhone,
          text: patientText,
          eventId: `booking-cancelled:${bookingId}`,
        });
        const cancelledPushVariant = resolvePatientPushVariant(payload, 'cancelled');
        if (cancelledPushVariant) {
          await sendBookingWebPush({
            ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
            ...(webappEventsPort ? { webappEventsPort } : {}),
            phoneNormalized: contactPhone,
            intentType: 'appointment_lifecycle',
            variant: cancelledPushVariant,
            slotStartIso: payload.slotStart,
            stableKey: `booking-cancelled:${bookingId}`,
          });
        }
      }
      if (shouldNotifyDoctor(payload)) {
        await sendDoctorMessage(
          dispatchPort,
          resolveDoctorMessageText(payload, doctorCancelledText(payload, timeZone)),
          `booking-cancelled:${bookingId}`,
        );
      }
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.rescheduled') {
      if (shouldCancelPendingReminders(payload)) {
        await cancelPendingBookingReminders(bookingId);
      }
      const patientText = resolvePatientMessageText(payload, patientRescheduledText(payload, timeZone));
      await sendLinkedChannelMessage({
        dispatchPort,
        phoneNormalized: contactPhone,
        text: patientText,
        eventId: `booking-rescheduled:${bookingId}`,
      });
      if (shouldNotifyDoctor(payload)) {
        await sendDoctorMessage(
          dispatchPort,
          resolveDoctorMessageText(payload, doctorRescheduledText(payload, timeZone)),
          `booking-rescheduled:${bookingId}`,
        );
      }
      const rescheduledPushVariant = resolvePatientPushVariant(payload, 'rescheduled');
      if (rescheduledPushVariant) {
        await sendBookingWebPush({
          ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
          ...(webappEventsPort ? { webappEventsPort } : {}),
          phoneNormalized: contactPhone,
          intentType: 'appointment_lifecycle',
          variant: rescheduledPushVariant,
          slotStartIso: payload.slotStart,
          stableKey: `booking-rescheduled:${bookingId}`,
        });
      }
      await scheduleBookingReminders({
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        bookingId,
        slotStartIso: payload.slotStart,
        phoneNormalized: contactPhone,
        patientName,
        timeZone,
        ...(webappEventsPort ? { webappEventsPort } : {}),
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
      });
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.payment_captured') {
      const patientText = resolvePatientMessageText(
        payload,
        `Оплата записи подтверждена. ${formatBookingRuDateTime(payload.slotStart, timeZone)}`,
      );
      await sendLinkedChannelMessage({
        dispatchPort,
        phoneNormalized: contactPhone,
        text: patientText,
        eventId: `booking-payment:${bookingId}`,
      });
      if (shouldNotifyDoctor(payload)) {
        await sendDoctorMessage(
          dispatchPort,
          resolveDoctorMessageText(
            payload,
            `Оплата записи: ${patientName ?? 'пациент'}, ${formatBookingRuDateTime(payload.slotStart, timeZone)}`,
          ),
          `booking-payment:${bookingId}`,
        );
      }
      await scheduleBookingReminders({
        ...(payload.organizationId ? { organizationId: payload.organizationId } : {}),
        bookingId,
        slotStartIso: payload.slotStart,
        phoneNormalized: contactPhone,
        patientName,
        timeZone,
        ...(webappEventsPort ? { webappEventsPort } : {}),
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
      });
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.reschedule_requested') {
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.deleted') {
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    if (eventType === 'booking.package_linked' || eventType === 'booking.package_unlinked') {
      await trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort);
      return;
    }

    throw new Error('unsupported_booking_event_type');
  } catch (err) {
    await releaseBookingLifecycleKey(acquiredKey, options.idempotencyPort);
    throw err;
  }
}

export async function handleBookingEventRequest(
  request: FastifyRequest,
  reply: FastifyReply,
  routeLabel: 'booking lifecycle-event',
  guard: SignedRequestGuard,
  dispatchPort: DispatchPort,
  deps: Pick<BookingLifecycleRouteDeps, 'idempotencyPort' | 'webappEventsPort'>,
) {
  const g = guard(request);
  if (!g.ok) {
    return reply.code(g.code).send({ ok: false, error: g.err });
  }
  const parsed = parseBookingLifecycleEvent(request.body);
  if (!parsed.success) {
    logger.warn({ err: parsed.error.flatten() }, `${routeLabel} validation failed`);
    return reply.code(400).send({ ok: false, error: 'invalid_booking_event' });
  }
  try {
    await handleBookingLifecycleEvent(parsed.data, dispatchPort, {
      ...(deps.idempotencyPort ? { idempotencyPort: deps.idempotencyPort } : {}),
      ...(deps.webappEventsPort ? { webappEventsPort: deps.webappEventsPort } : {}),
    });
    return reply.code(200).send({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.warn({ err }, `${routeLabel} failed`);
    return reply.code(502).send({ ok: false, error: msg });
  }
}

export async function registerBersoncareBookingLifecycleRoute(
  app: FastifyInstance,
  deps: BookingLifecycleRouteDeps,
): Promise<void> {
  const guard = createSignedRequestGuard(deps.sharedSecret, 'booking lifecycle-event');

  app.post('/api/bersoncare/booking/lifecycle-event', async (request, reply) =>
    handleBookingEventRequest(
      request,
      reply,
      'booking lifecycle-event',
      guard,
      deps.dispatchPort,
      deps,
    ),
  );
}
