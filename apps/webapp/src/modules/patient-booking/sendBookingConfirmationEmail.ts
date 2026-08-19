/**
 * Письмо-подтверждение записи с .ics-вложением.
 *
 * Решение владельца 19.08: «письмо и уведомление не надо ждать — абсолютно точно». До этой правки
 * функция ждала синхронный HTTP-relay к интегратору, который держал ответ пациенту до конца
 * SMTP-хендшейка — 9.0 с из 12.4 с подтверждения записи. Теперь она кладёт сообщение в очередь
 * доставки одним объявленным корнем (`app.enqueue_outbound_message`) и возвращается; отправку,
 * ретраи и планирование делает воркер доставки интегратора — «у него есть планировщик, есть
 * ретраи, все есть».
 *
 * Правила, сохранённые дословно:
 *   - нет contactEmail — тихо пропускаем;
 *   - ошибка постановки — только лог, запись уже подтверждена (правило A12);
 *   - НИКОГДА не бросает.
 *
 * Идемпотентность стала строже, а не слабее. Была: relay выводил 24-часовой ключ дедупа из
 * `messageId`. Стала: `event_id` = `booking.confirmation:<bookingId>` в UNIQUE-колонке очереди с
 * `ON CONFLICT DO NOTHING` — навсегда. Ретрай очереди повторяет отправку ОДНОЙ строки; второе
 * письмо и второй календарный файл создать невозможно.
 *
 * #81: email delivery of .ics on booking confirmation.
 */

import { env } from '@/config/env';
import { buildIcsContent } from '@/shared/lib/buildCalendarLinks';
import { logger } from '@/infra/logging/logger';
import type { OutboundMessageQueuePort } from '@/modules/messaging/outboundMessageQueuePort';

/** Назначение сообщения. Идёт в `event_id`; ветки по нему не строит никто. */
export const BOOKING_CONFIRMATION_PURPOSE = 'booking.confirmation';

export type BookingConfirmationEmailInput = {
  /** Уникальный ID брони (ключ идемпотентности и UID ICS). */
  bookingId: string;
  /** Арендатор, которому принадлежит запись. */
  organizationId: string;
  /** Email пациента. Если не указан — функция немедленно возвращается. */
  contactEmail: string | null | undefined;
  /** Дата и время начала (ISO). */
  slotStart: string;
  /** Дата и время конца (ISO). */
  slotEnd: string;
  /** Название услуги (для SUMMARY ICS и тела письма). */
  serviceTitle: string;
  /** «Онлайн» или адрес/название филиала (для LOCATION ICS). */
  locationLabel?: string | null;
  /** Имя пациента (для обращения в теле письма). */
  contactName?: string | null;
};

export type BookingConfirmationEmailDeps = {
  /**
   * Порт постановки в очередь. Внедряется из `buildAppDeps`, а не импортируется: модуль не знает
   * про `infra/repos` (§5 clean architecture). Отсутствие порта — не молчаливый пропуск письма,
   * а видимая ошибка в логе через общий catch ниже.
   */
  outboundMessageQueue: OutboundMessageQueuePort;
};

/**
 * Кладёт письмо в очередь доставки. `true` — сообщение поставлено этим вызовом,
 * `false` — пропущено, уже стоит в очереди, или постановка не удалась.
 */
export async function sendBookingConfirmationEmail(
  input: BookingConfirmationEmailInput,
  deps: BookingConfirmationEmailDeps,
): Promise<boolean> {
  const { contactEmail } = input;

  // Нет email — тихо пропускаем.
  if (!contactEmail?.trim()) {
    return false;
  }

  try {
    const appBaseUrl = env.APP_BASE_URL;
    const icsText = buildIcsContent(
      {
        startAt: input.slotStart,
        endAt: input.slotEnd,
        summary: input.serviceTitle,
        location: input.locationLabel?.trim() || undefined,
        bookingId: input.bookingId,
      },
      appBaseUrl,
    );

    // Base64 — ровно то, что читает email-адаптер интегратора из payload.icsContent.
    const icsBase64 = Buffer.from(icsText, 'utf-8').toString('base64');

    const greeting = input.contactName?.trim()
      ? `Здравствуйте, ${input.contactName.trim()}!`
      : 'Здравствуйте!';
    const location = input.locationLabel?.trim() ?? 'Онлайн';

    const textBody = [
      greeting,
      '',
      'Ваша запись подтверждена.',
      `Услуга: ${input.serviceTitle}`,
      `Место: ${location}`,
      '',
      'Файл .ics во вложении — добавьте событие в свой календарь.',
      '',
      'С уважением, BersonCare',
    ].join('\n');

    const htmlBody = [
      `<p>${greeting}</p>`,
      '<p>Ваша запись <strong>подтверждена</strong>.</p>',
      '<ul>',
      `  <li>Услуга: ${escapeHtmlSimple(input.serviceTitle)}</li>`,
      `  <li>Место: ${escapeHtmlSimple(location)}</li>`,
      '</ul>',
      '<p>Файл <code>.ics</code> во вложении — добавьте событие в свой календарь.</p>',
      '<p>С уважением, BersonCare</p>',
    ].join('\n');

    const enqueued = await deps.outboundMessageQueue.enqueue({
      organizationId: input.organizationId,
      purpose: BOOKING_CONFIRMATION_PURPOSE,
      idempotencyKey: input.bookingId,
      channel: 'email',
      recipient: contactEmail.trim(),
      content: {
        text: textBody,
        html: htmlBody,
        subject: `Запись подтверждена: ${input.serviceTitle}`,
        icsContent: icsBase64,
        icsFilename: `bersoncare-booking-${input.bookingId}.ics`,
      },
    });

    logger.info(
      {
        event: 'booking.confirmation_email.enqueued',
        bookingId: input.bookingId,
        enqueued,
      },
      enqueued
        ? 'booking confirmation email queued'
        : 'booking confirmation email already queued (idempotent no-op)',
    );
    return enqueued;
  } catch (err) {
    logger.warn(
      {
        err,
        event: 'booking.confirmation_email.error',
        bookingId: input.bookingId,
      },
      'booking confirmation email enqueue failed (best-effort, booking already confirmed)',
    );
    return false;
  }
}

/** Минимальный HTML-escape для вставки в тело письма. */
function escapeHtmlSimple(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
