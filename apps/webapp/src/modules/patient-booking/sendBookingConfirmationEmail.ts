/**
 * Отправка пациенту письма-подтверждения записи с вложенным .ics-файлом.
 *
 * Вызывается как best-effort после успешного создания/подтверждения бронирования.
 * Правила:
 *   - Если у записи нет contactEmail — тихо пропускаем (не бросаем ошибку).
 *   - Ошибка отправки — только лог, не роняем на UI (правило A12).
 *   - Отправка идёт через relayOutbound → integrator SMTP (тот же транспорт, что и рассылки).
 *
 * #81: email delivery of .ics on booking confirmation.
 */

import { relayOutbound } from "@/modules/messaging/relayOutbound";
import type { RelayOutboundDeps } from "@/modules/messaging/relayOutbound";
import { buildIcsContent } from "@/shared/lib/buildCalendarLinks";
import { logger } from "@/infra/logging/logger";

export type BookingConfirmationEmailInput = {
  /** Уникальный ID брони (для idempotencyKey и UID ICS). */
  bookingId: string;
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

export type BookingConfirmationEmailDeps = RelayOutboundDeps;

/**
 * Отправляет письмо с .ics-вложением. Возвращает `true` при успехе, `false` при пропуске/ошибке.
 * НИКОГДА не бросает исключение — только логирует.
 */
export async function sendBookingConfirmationEmail(
  input: BookingConfirmationEmailInput,
  deps: BookingConfirmationEmailDeps = {},
): Promise<boolean> {
  const { contactEmail } = input;

  // Нет email — тихо пропускаем.
  if (!contactEmail?.trim()) {
    return false;
  }

  try {
    const icsText = buildIcsContent({
      startAt: input.slotStart,
      endAt: input.slotEnd,
      summary: input.serviceTitle,
      location: input.locationLabel?.trim() || undefined,
      bookingId: input.bookingId,
    });

    // Base64 для передачи через relay-outbound JSON body.
    const icsBase64 = Buffer.from(icsText, "utf-8").toString("base64");

    const greeting = input.contactName?.trim()
      ? `Здравствуйте, ${input.contactName.trim()}!`
      : "Здравствуйте!";
    const location = input.locationLabel?.trim() ?? "Онлайн";

    const textBody = [
      greeting,
      "",
      "Ваша запись подтверждена.",
      `Услуга: ${input.serviceTitle}`,
      `Место: ${location}`,
      "",
      "Файл .ics во вложении — добавьте событие в свой календарь.",
      "",
      "С уважением, BersonCare",
    ].join("\n");

    const htmlBody = [
      `<p>${greeting}</p>`,
      "<p>Ваша запись <strong>подтверждена</strong>.</p>",
      "<ul>",
      `  <li>Услуга: ${escapeHtmlSimple(input.serviceTitle)}</li>`,
      `  <li>Место: ${escapeHtmlSimple(location)}</li>`,
      "</ul>",
      "<p>Файл <code>.ics</code> во вложении — добавьте событие в свой календарь.</p>",
      "<p>С уважением, BersonCare</p>",
    ].join("\n");

    const result = await relayOutbound(
      {
        messageId: `booking.confirmation.ics:${input.bookingId}`,
        channel: "email",
        recipient: contactEmail.trim(),
        text: textBody,
        html: htmlBody,
        metadata: {
          subject: `Запись подтверждена: ${input.serviceTitle}`,
        },
        icsContent: icsBase64,
        icsFilename: `bersoncare-booking-${input.bookingId}.ics`,
      },
      deps,
    );

    if (!result.ok) {
      logger.warn(
        {
          event: "booking.confirmation_email.relay_failed",
          bookingId: input.bookingId,
          reason: result.reason,
        },
        "booking confirmation email relay failed (best-effort, booking already confirmed)",
      );
      return false;
    }

    logger.info(
      {
        event: "booking.confirmation_email.sent",
        bookingId: input.bookingId,
        status: result.status,
      },
      "booking confirmation email sent",
    );
    return true;
  } catch (err) {
    logger.warn(
      {
        err,
        event: "booking.confirmation_email.error",
        bookingId: input.bookingId,
      },
      "booking confirmation email failed (best-effort, booking already confirmed)",
    );
    return false;
  }
}

/** Минимальный HTML-escape для вставки в тело письма. */
function escapeHtmlSimple(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
