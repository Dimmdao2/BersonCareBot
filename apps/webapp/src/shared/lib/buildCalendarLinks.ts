/**
 * Утилиты для добавления записи в Google/Яндекс-календарь и генерации ICS-файла.
 *
 * ICS-формат: RFC 5545, временны́е метки в UTC (суффикс Z), уникальный UID.
 * Не зависит от DOM/navigator — может вызываться и в тестах без jsdom.
 */

export type CalendarEventParams = {
  /** ISO-строка начала (с timezone offset или Z). */
  startAt: string;
  /** ISO-строка конца (с timezone offset или Z). */
  endAt: string;
  /** Краткое название события (услуга + специалист). */
  summary: string;
  /** Адрес кабинета / «Онлайн». Пустая строка — локация не указывается. */
  location?: string;
  /** Расширенное описание (например, имя специалиста, телефон для связи). */
  description?: string;
  /** Уникальный ID записи (используется для стабильного UID ICS). */
  bookingId?: string;
};

/** Форматирует Date в ICS-строку UTC: `YYYYMMDDTHHmmssZ`. */
export function toIcsDateTime(d: Date): string {
  const pad = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}` +
    `T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`
  );
}

/**
 * Экранирование специальных символов RFC 5545 (запятая, точка с запятой, обратный слеш, перевод строки).
 * Длина строки не ограничивается (разбивка на 75 байт — опциональная, браузеры/сервисы принимают без неё).
 */
export function escapeIcsText(s: string): string {
  return s
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "");
}

/**
 * Генерирует текст ICS-файла (VCALENDAR + VEVENT).
 * Возвращает строку, которую можно скачать как `.ics`.
 */
export function buildIcsContent(params: CalendarEventParams): string {
  const start = toIcsDateTime(new Date(params.startAt));
  const end = toIcsDateTime(new Date(params.endAt));
  const uid = params.bookingId
    ? `booking-${params.bookingId}@bersoncare.ru`
    : `booking-${start}-${Math.random().toString(36).slice(2)}@bersoncare.ru`;
  const now = toIcsDateTime(new Date());

  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//BersonCare//Patient Booking//RU",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${escapeIcsText(params.summary)}`,
  ];

  if (params.location?.trim()) {
    lines.push(`LOCATION:${escapeIcsText(params.location.trim())}`);
  }
  if (params.description?.trim()) {
    lines.push(`DESCRIPTION:${escapeIcsText(params.description.trim())}`);
  }

  lines.push("END:VEVENT", "END:VCALENDAR");

  // RFC 5545 требует CRLF (\r\n) в качестве разделителя строк.
  return lines.join("\r\n") + "\r\n";
}

/**
 * Формирует URL для добавления события в Google Calendar.
 * https://calendar.google.com/calendar/render?action=TEMPLATE&...
 */
export function buildGoogleCalendarUrl(params: CalendarEventParams): string {
  const fmt = (iso: string) =>
    new Date(iso)
      .toISOString()
      .replace(/[-:]/g, "")
      .replace(/\.\d{3}Z$/, "Z");

  const q = new URLSearchParams({
    action: "TEMPLATE",
    dates: `${fmt(params.startAt)}/${fmt(params.endAt)}`,
    text: params.summary,
  });
  if (params.location?.trim()) q.set("location", params.location.trim());
  if (params.description?.trim()) q.set("details", params.description.trim());

  return `https://calendar.google.com/calendar/render?${q.toString()}`;
}

/**
 * Формирует URL для добавления события в Яндекс.Календарь.
 * https://calendar.yandex.ru/event/create?...
 * Параметры: name, description, from (UNIX-секунды UTC), to (UNIX-секунды UTC).
 */
export function buildYandexCalendarUrl(params: CalendarEventParams): string {
  const fromSec = Math.floor(new Date(params.startAt).getTime() / 1000);
  const toSec = Math.floor(new Date(params.endAt).getTime() / 1000);

  const q = new URLSearchParams({
    name: params.summary,
    from: String(fromSec),
    to: String(toSec),
  });
  if (params.description?.trim()) q.set("description", params.description.trim());
  if (params.location?.trim()) q.set("location", params.location.trim());

  return `https://calendar.yandex.ru/event/create?${q.toString()}`;
}
