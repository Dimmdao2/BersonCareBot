import { createHmac, timingSafeEqual } from 'node:crypto';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../infra/observability/logger.js';
import { env } from '../../config/env.js';
import { createDbPort } from '../../infra/db/client.js';
import { runWithOrganizationPrincipal } from '../../infra/principal/organizationPrincipal.js';
import { createDeliveryTargetsPort } from '../../infra/adapters/deliveryTargetsPort.js';
import { loadAdminMessengerIdLists } from '../../infra/operatorIncident/operatorHealthAlertConfigIntegrator.js';
import {
  EMPTY_AUDIENCE_INCIDENT_DIRECTION,
  reportEmptyNotificationAudience,
} from '../../infra/operatorIncident/reportEmptyNotificationAudience.js';
import {
  recordOperatorFailureIncident,
  reportOperatorFailure,
} from '../../infra/operatorIncident/reportOperatorFailure.js';
import { PATIENT_NOTIFICATION_TOPIC_APPOINTMENT_REMINDERS } from '../../kernel/domain/reminders/patientNotificationTopics.js';
import type {
  DbWritePort,
  DispatchPort,
  IdempotencyPort,
  WebappEventsPort,
} from '../../kernel/contracts/index.js';
import { getAppDisplayTimezone } from '../../config/appTimezone.js';
import { maxUserRecipient } from '../max/maxRecipient.js';
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

/** Темы уведомлений записи. Низкая кардинальность: они входят в dedup-ключ инцидента. */
export const BOOKING_LINKED_CHANNEL_TOPIC = 'booking_linked_channel_message';
export const BOOKING_STAFF_MESSAGE_TOPIC = 'booking_staff_message';
export const BOOKING_REMINDER_MATERIALIZATION_TOPIC = 'booking_reminder_materialization';

/**
 * Направление инцидента об упавшем шаге события записи. Отдельное от
 * `EMPTY_AUDIENCE_INCIDENT_DIRECTION`: там причина «некому слать», здесь — «шаг не отработал».
 */
export const BOOKING_LIFECYCLE_STEP_INCIDENT_DIRECTION = 'booking_lifecycle_step';

const WINDOW_SECONDS = 300;
const BOOKING_EVENT_DEDUP_TTL_MS = 24 * 60 * 60 * 1000;

type ReqWithRawBody = FastifyRequest & { rawBody?: string };

export type BookingLifecycleRouteDeps = {
  sharedSecret: string;
  dispatchPort: DispatchPort;
  dbWritePort: DbWritePort;
  idempotencyPort: IdempotencyPort;
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

/** Имена шагов. Низкая кардинальность: они входят в ключ дедупликации и в текст отказа. */
type BookingLifecycleStepName =
  | 'patient_message'
  | 'patient_web_push'
  | 'doctor_message'
  | 'appointment_reminders'
  | 'google_calendar';

type BookingLifecycleStep = {
  name: BookingLifecycleStepName;
  run: () => Promise<void>;
};

type BookingLifecycleEventKey = {
  eventType: BookingLifecycleEventValidated['eventType'];
  eventId: string;
  payload: BookingLifecyclePayloadValidated;
};

function lifecycleDedupStorageKey(
  input: BookingLifecycleEventKey,
  step: BookingLifecycleStepName,
): string {
  const appointmentOrBookingId =
    asNonEmptyString(input.payload.canonicalAppointmentId) ?? input.payload.bookingId;
  return `booking-lifecycle:${input.eventType}:${appointmentOrBookingId}:${input.eventId}:${step}`.slice(
    0,
    240,
  );
}

function errorMessageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

/** Отказ обработчика называет ИМЕННО те шаги, что упали, а не первый попавшийся. */
export class BookingLifecycleStepFailure extends Error {
  readonly steps: readonly BookingLifecycleStepName[];

  constructor(failures: readonly { step: BookingLifecycleStepName; error: unknown }[]) {
    super(failures.map((failure) => `${failure.step}: ${errorMessageOf(failure.error)}`).join('; '));
    this.name = 'BookingLifecycleStepFailure';
    this.steps = failures.map((failure) => failure.step);
  }
}

/**
 * Шаги события НЕЗАВИСИМЫ.
 *
 * Что чинится (19.08). Шаги стояли одной цепочкой `await`-ов, и на `booking.created` /
 * `booking.rescheduled` / `booking.payment_captured` календарь стоял ПОСЛЕ напоминаний. Напоминания
 * падали — до календаря управление не доходило никогда. Порядок строк в функции был скрытой
 * зависимостью: «шаг выполнен» означало «ни один предыдущий не упал».
 *
 * Второе, что чинится, — дубли. Ключ дедупликации был ОДИН на всё событие и освобождался при любом
 * отказе, поэтому повтор события (`postSignedWithRetry` — до трёх попыток) заново слал пациенту и
 * врачу уже отправленные сообщения. Теперь ключ у КАЖДОГО шага свой и освобождается только у
 * упавшего: повтор доигрывает ровно недоигранное и ничего больше.
 *
 * Шаги идут последовательно намеренно: независимость здесь про отказ, а не про параллелизм — они
 * делят одно соединение к базе и один принципал организации.
 */
async function runBookingLifecycleSteps(
  steps: readonly BookingLifecycleStep[],
  key: BookingLifecycleEventKey,
  idempotencyPort: IdempotencyPort,
): Promise<void> {
  const failures: { step: BookingLifecycleStepName; error: unknown }[] = [];
  for (const step of steps) {
    const storageKey = lifecycleDedupStorageKey(key, step.name);
    if (!(await idempotencyPort.tryAcquire(storageKey, BOOKING_EVENT_DEDUP_TTL_MS / 1000))) continue;
    try {
      await step.run();
    } catch (error) {
      await idempotencyPort.release?.(storageKey);
      failures.push({ step: step.name, error });
      logger.warn(
        {
          err: error,
          scope: 'booking_lifecycle',
          event: 'booking_lifecycle_step_failed',
          step: step.name,
          eventType: key.eventType,
        },
        'booking lifecycle step failed; the remaining steps still run',
      );
      // Отказ шага перестаёт быть только строкой журнала. Раньше он уходил в 502, вебапп его
      // выбрасывал пустым `catch {}` — и о том, что врач не получил сообщения, а календарь не
      // обновился, не узнавал никто. Инцидент открывается БЕЗ немедленного алерта
      // (`recordOperatorFailureIncident`): шаг напоминаний шлёт свой громкий алерт сам, и второго
      // на то же событие быть не должно. Ключ дедупликации — `direction:integration:errorClass`,
      // то есть один сломанный шаг = один инцидент, а не по одному на запись.
      try {
        await recordOperatorFailureIncident({
          direction: BOOKING_LIFECYCLE_STEP_INCIDENT_DIRECTION,
          integration: step.name,
          errorClass: `${key.eventType}_step_failed`,
          errorDetail: errorMessageOf(error).slice(0, 500),
        });
      } catch (incidentError) {
        logger.warn(
          {
            err: incidentError,
            scope: 'booking_lifecycle',
            event: 'booking_lifecycle_step_incident_failed',
            step: step.name,
          },
          'booking lifecycle step incident could not be recorded',
        );
      }
    }
  }
  if (failures.length > 0) throw new BookingLifecycleStepFailure(failures);
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
  organizationId: string;
  text: string;
  eventId: string;
}): Promise<void> {
  if (!input.phoneNormalized) return;
  const deliveryTargets = createDeliveryTargetsPort({
    getAppBaseUrl: async () => env.APP_BASE_URL,
  });
  const fetched = await deliveryTargets.getTargetsByPhone(input.phoneNormalized, {
    organizationId: input.organizationId,
  });
  // D-b: пустая аудитория не бывает тихим успехом — и отказ резолвера не смеет выглядеть
  // как «получателей нет». Обе ветки уходят в единый порт инцидентов, каждая со своей причиной.
  if (!fetched?.channelBindings) {
    await reportEmptyNotificationAudience({
      topic: BOOKING_LINKED_CHANNEL_TOPIC,
      severity: 'user_facing',
      reason: 'resolution_failed',
      organizationId: input.organizationId,
    });
    return;
  }
  const bindings = fetched.channelBindings;
  const hasTelegram = typeof bindings.telegramId === 'string' && bindings.telegramId.trim() !== '';
  const hasMax = typeof bindings.maxId === 'string' && bindings.maxId.trim() !== '';
  if (!hasTelegram && !hasMax) {
    await reportEmptyNotificationAudience({
      topic: BOOKING_LINKED_CHANNEL_TOPIC,
      severity: 'user_facing',
      reason: 'no_channel_bindings',
      organizationId: input.organizationId,
    });
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
  organizationId: string,
): Promise<void> {
  let recipients: Awaited<ReturnType<typeof loadAdminMessengerIdLists>>;
  try {
    recipients = await loadAdminMessengerIdLists();
  } catch (err) {
    // Резолвер штатной аудитории отказал — врач не узнает о записи. Инцидент поднимается ЗДЕСЬ,
    // а ошибка летит дальше НАМЕРЕННО: ретрай события (502 + освобождение dedup-ключа) — прежний
    // контракт для отказа, который может быть временным, и он остаётся в силе. Чинится не ретрай,
    // а тишина: раньше отказ уходил только в `err: {type: 'Error'}` без текста.
    await reportEmptyNotificationAudience({
      topic: BOOKING_STAFF_MESSAGE_TOPIC,
      severity: 'user_facing',
      reason: 'resolution_failed',
      organizationId,
    });
    throw err;
  }
  if (recipients.telegram.length === 0 && recipients.max.length === 0) {
    await reportEmptyNotificationAudience({
      topic: BOOKING_STAFF_MESSAGE_TOPIC,
      severity: 'user_facing',
      reason: 'no_channel_bindings',
      organizationId,
    });
    return;
  }
  for (const chatId of recipients.telegram) {
    await dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: `${eventId}:doctor:telegram:${chatId}`, occurredAt: new Date().toISOString(), source: 'telegram' },
      payload: { recipient: { chatId }, message: { text }, delivery: { channels: ['telegram'], maxAttempts: 3 } },
    });
  }
  for (const userId of recipients.max) {
    await dispatchPort.dispatchOutgoing({
      type: 'message.send',
      meta: { eventId: `${eventId}:doctor:max:${userId}`, occurredAt: new Date().toISOString(), source: 'max' },
      payload: { recipient: maxUserRecipient(userId), message: { text }, delivery: { channels: ['max'], maxAttempts: 3 } },
    });
  }
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
  organizationId: string;
  appointmentId?: string;
  platformUserId?: string;
  bookingId: string;
  slotStartIso: string;
  phoneNormalized: string | null;
  patientName: string | null;
  timeZone: string;
  webappEventsPort?: WebappEventsPort;
  /** Вебапп решает, включены ли напоминания и с какими смещениями; отсутствие плана — не ставить ни одного напоминания. */
  reminderPlan?: { enabled: boolean; offsetsMinutes: number[] };
  cancelPending?: boolean;
}): Promise<void> {
  if (!input.reminderPlan) {
    logger.warn(
      {
        scope: 'notification_delivery',
        event: 'notification_audience_empty',
        topic: 'booking_reminder_scheduling',
        severity: 'user_facing',
        reason: 'no_reminder_plan',
      },
      'appointment reminders not scheduled: webapp sent no reminder plan',
    );
  }
  if (!input.webappEventsPort?.materializeAppointmentReminders) {
    logger.warn(
      { bookingId: input.bookingId },
      'appointment reminder materializer unavailable; legacy enqueue is intentionally disabled',
    );
    return;
  }
  if (!input.appointmentId) {
    logger.warn(
      { bookingId: input.bookingId },
      'appointment reminder canonical scope missing; legacy enqueue is intentionally disabled',
    );
    return;
  }
  const body = JSON.stringify({
    organizationId: input.organizationId,
    appointmentId: input.appointmentId,
    bookingId: input.bookingId,
    ...(input.platformUserId ? { platformUserId: input.platformUserId } : {}),
    ...(input.phoneNormalized ? { phoneNormalized: input.phoneNormalized } : {}),
    slotStartIso: input.slotStartIso,
    patientName: input.patientName,
    cancelPending: input.cancelPending === true,
    reminderPlan: input.reminderPlan ?? { enabled: false, offsetsMinutes: [] },
  });
  const generationKey = `${input.appointmentId}:${input.slotStartIso}`;
  const result = await input.webappEventsPort.materializeAppointmentReminders({
    body,
    idempotencyKey: `arm:${generationKey}:${input.cancelPending ? 'cancel' : 'replace'}`.slice(0, 240),
  });
  if (!result.ok) {
    // 19.08: отказ материализации тонул в 502 и трёх повторах — напоминания не появлялись, и об
    // этом никто не узнавал. Инцидент открывается ЗДЕСЬ, ошибка летит дальше НАМЕРЕННО: повтор
    // именно этого шага остаётся в силе (см. `runBookingLifecycleSteps`), чинится не повтор, а
    // тишина. Dedup-ключ инцидента — `direction:integration:errorClass`, без записи и без статуса:
    // одна сломанная материализация обязана открыть ОДИН инцидент, а не по одному на запись.
    try {
      await reportOperatorFailure({
        direction: EMPTY_AUDIENCE_INCIDENT_DIRECTION,
        integration: BOOKING_REMINDER_MATERIALIZATION_TOPIC,
        errorClass: 'reminder_materialization_failed',
        errorDetail: `status=${result.status}`,
        alertLines: [
          'Критичный сбой: напоминания о записи не созданы',
          'Пациент не получит ни одного напоминания об этой записи.',
          `Материализатор ответил ${result.status}.`,
        ],
      });
    } catch (err) {
      logger.warn(
        { err, scope: 'booking_lifecycle', event: 'reminder_materialization_incident_failed' },
        'appointment reminder materialization incident could not be recorded',
      );
    }
    throw new Error(`APPOINTMENT_REMINDER_MATERIALIZATION_FAILED:${result.status}`);
  }
}

async function sendBookingWebPush(input: {
  organizationId: string;
  webappEventsPort?: WebappEventsPort;
  phoneNormalized: string | null;
  intentType: 'appointment_lifecycle' | 'appointment_reminder';
  slotStartIso: string;
  stableKey: string;
  variant?: 'created' | 'cancelled' | 'rescheduled';
  nowIso?: string;
}): Promise<void> {
  if (!input.webappEventsPort?.notifyPatientWebPush || !input.phoneNormalized) return;
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
            organizationId: payload.organizationId,
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
        organizationId: payload.organizationId,
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

/**
 * Список шагов события. Каждая ветка ОБЪЯВЛЯЕТ, что должно произойти; порядок в списке ни на что не
 * влияет — исполнитель гоняет шаги независимо (`runBookingLifecycleSteps`). Раньше эти же шаги были
 * цепочкой `await`-ов, и календарь на `booking.created` стоял после напоминаний, то есть не
 * выполнялся никогда, пока напоминания падали.
 */
function bookingLifecycleSteps(input: {
  body: BookingLifecycleEventValidated;
  dispatchPort: DispatchPort;
  webappEventsPort?: WebappEventsPort;
  /** Часовой пояс читается ЛЕНИВО и один раз: событие без текстов за ним не ходит, а отказ этого
   *  чтения касается только шагов с текстом — календарь он не отменяет. */
  displayTimeZone: () => Promise<string>;
}): readonly BookingLifecycleStep[] {
  const { body, dispatchPort, webappEventsPort, displayTimeZone } = input;
  const { payload, eventType } = body;
  const bookingId = payload.bookingId;
  const contactPhone = asNonEmptyString(payload.contactPhone);
  const patientName = asNonEmptyString(payload.contactName);

  const calendarStep: BookingLifecycleStep = {
    name: 'google_calendar',
    run: () => trySyncCanonicalBookingToGoogleCalendar(eventType, payload, dispatchPort),
  };

  const patientMessageStep = (eventId: string, text: () => Promise<string>): BookingLifecycleStep => ({
    name: 'patient_message',
    run: async () => {
      await sendLinkedChannelMessage({
        dispatchPort,
        phoneNormalized: contactPhone,
        organizationId: payload.organizationId,
        text: await text(),
        eventId,
      });
    },
  });

  const doctorMessageStep = (eventId: string, text: () => Promise<string>): BookingLifecycleStep => ({
    name: 'doctor_message',
    run: async () => {
      await sendDoctorMessage(dispatchPort, await text(), eventId, payload.organizationId);
    },
  });

  const patientPushStep = (
    stableKey: string,
    variant: 'created' | 'cancelled' | 'rescheduled',
  ): BookingLifecycleStep => ({
    name: 'patient_web_push',
    run: () =>
      sendBookingWebPush({
        organizationId: payload.organizationId,
        ...(webappEventsPort ? { webappEventsPort } : {}),
        phoneNormalized: contactPhone,
        intentType: 'appointment_lifecycle',
        variant,
        slotStartIso: payload.slotStart,
        stableKey,
      }),
  });

  const remindersStep = (options: {
    reminderPlan?: { enabled: boolean; offsetsMinutes: number[] };
    cancelPending: boolean;
  }): BookingLifecycleStep => ({
    name: 'appointment_reminders',
    run: async () =>
      scheduleBookingReminders({
        organizationId: payload.organizationId,
        ...(payload.canonicalAppointmentId
          ? { appointmentId: payload.canonicalAppointmentId }
          : {}),
        platformUserId: payload.userId,
        bookingId,
        slotStartIso: payload.slotStart,
        phoneNormalized: contactPhone,
        patientName,
        timeZone: await displayTimeZone(),
        ...(webappEventsPort ? { webappEventsPort } : {}),
        ...(options.reminderPlan ? { reminderPlan: options.reminderPlan } : {}),
        cancelPending: options.cancelPending,
      }),
  });

  if (
    eventType === 'booking.reschedule_requested' ||
    eventType === 'booking.deleted' ||
    eventType === 'booking.package_linked' ||
    eventType === 'booking.package_unlinked'
  ) {
    return [calendarStep];
  }

  if (eventType === 'booking.created') {
    const steps: BookingLifecycleStep[] = [];
    // 19.08: `suppressPatientNotification` читается и здесь. Вебапп, создавший запись, сам ставит
    // пациентское сообщение в очередь доставки (`app.enqueue_outbound_message`) — тогда он
    // выставляет флаг, и второй отправки быть не должно. Отправитель без флага (старый вызывающий)
    // получает прежнее поведение бит в бит.
    if (payload.suppressPatientNotification !== true) {
      steps.push(
        patientMessageStep(`booking-created:${bookingId}`, async () =>
          resolvePatientMessageText(payload, patientCreatedText(payload, await displayTimeZone())),
        ),
      );
    }
    if (shouldNotifyDoctor(payload)) {
      steps.push(
        doctorMessageStep(`booking-created:${bookingId}`, async () =>
          resolveDoctorMessageText(payload, doctorCreatedText(payload, await displayTimeZone())),
        ),
      );
    }
    steps.push(
      remindersStep({
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
        cancelPending: shouldCancelPendingReminders(payload) && !payload.reminderPlan?.enabled,
      }),
      calendarStep,
    );
    return steps;
  }

  if (eventType === 'booking.cancelled') {
    const steps: BookingLifecycleStep[] = [
      remindersStep({
        reminderPlan: { enabled: false, offsetsMinutes: [] },
        cancelPending: shouldCancelPendingReminders(payload),
      }),
    ];
    if (payload.suppressPatientNotification !== true) {
      steps.push(
        patientMessageStep(`booking-cancelled:${bookingId}`, async () =>
          resolvePatientMessageText(payload, patientCancelledText(payload, await displayTimeZone())),
        ),
      );
      const cancelledPushVariant = resolvePatientPushVariant(payload, 'cancelled');
      if (cancelledPushVariant) {
        steps.push(patientPushStep(`booking-cancelled:${bookingId}`, cancelledPushVariant));
      }
    }
    if (shouldNotifyDoctor(payload)) {
      steps.push(
        doctorMessageStep(`booking-cancelled:${bookingId}`, async () =>
          resolveDoctorMessageText(payload, doctorCancelledText(payload, await displayTimeZone())),
        ),
      );
    }
    steps.push(calendarStep);
    return steps;
  }

  if (eventType === 'booking.rescheduled') {
    const steps: BookingLifecycleStep[] = [
      patientMessageStep(`booking-rescheduled:${bookingId}`, async () =>
        resolvePatientMessageText(payload, patientRescheduledText(payload, await displayTimeZone())),
      ),
    ];
    if (shouldNotifyDoctor(payload)) {
      steps.push(
        doctorMessageStep(`booking-rescheduled:${bookingId}`, async () =>
          resolveDoctorMessageText(payload, doctorRescheduledText(payload, await displayTimeZone())),
        ),
      );
    }
    const rescheduledPushVariant = resolvePatientPushVariant(payload, 'rescheduled');
    if (rescheduledPushVariant) {
      steps.push(patientPushStep(`booking-rescheduled:${bookingId}`, rescheduledPushVariant));
    }
    steps.push(
      remindersStep({
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
        cancelPending: false,
      }),
      calendarStep,
    );
    return steps;
  }

  if (eventType === 'booking.reminder_updated') {
    return [
      remindersStep({
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
        cancelPending: shouldCancelPendingReminders(payload) && !payload.reminderPlan?.enabled,
      }),
    ];
  }

  if (eventType === 'booking.payment_captured') {
    const steps: BookingLifecycleStep[] = [
      patientMessageStep(`booking-payment:${bookingId}`, async () =>
        resolvePatientMessageText(
          payload,
          `Оплата записи подтверждена. ${formatBookingRuDateTime(payload.slotStart, await displayTimeZone())}`,
        ),
      ),
    ];
    if (shouldNotifyDoctor(payload)) {
      steps.push(
        doctorMessageStep(`booking-payment:${bookingId}`, async () =>
          resolveDoctorMessageText(
            payload,
            `Оплата записи: ${patientName ?? 'пациент'}, ${formatBookingRuDateTime(payload.slotStart, await displayTimeZone())}`,
          ),
        ),
      );
    }
    steps.push(
      remindersStep({
        ...(payload.reminderPlan ? { reminderPlan: payload.reminderPlan } : {}),
        cancelPending: false,
      }),
      calendarStep,
    );
    return steps;
  }

  throw new Error('unsupported_booking_event_type');
}

export async function handleBookingLifecycleEvent(
  body: BookingLifecycleEventValidated,
  dispatchPort: DispatchPort,
  options: {
    idempotencyPort: IdempotencyPort;
    webappEventsPort?: WebappEventsPort;
  },
): Promise<void> {
  const { payload, eventType } = body;
  const dedupKey = asNonEmptyString(body.idempotencyKey) ?? `${eventType}:${payload.bookingId}`;

  let timeZone: Promise<string> | null = null;
  const displayTimeZone = (): Promise<string> => {
    timeZone ??= getAppDisplayTimezone({ db: createDbPort(), dispatchPort });
    return timeZone;
  };

  const steps = bookingLifecycleSteps({
    body,
    dispatchPort,
    ...(options.webappEventsPort ? { webappEventsPort: options.webappEventsPort } : {}),
    displayTimeZone,
  });
  await runBookingLifecycleSteps(
    steps,
    { eventType, eventId: dedupKey, payload },
    options.idempotencyPort,
  );
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
    const handleEvent = () =>
      handleBookingLifecycleEvent(parsed.data, dispatchPort, {
        idempotencyPort: deps.idempotencyPort,
        ...(deps.webappEventsPort ? { webappEventsPort: deps.webappEventsPort } : {}),
      });
    await runWithOrganizationPrincipal(parsed.data.payload.organizationId, handleEvent);
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
