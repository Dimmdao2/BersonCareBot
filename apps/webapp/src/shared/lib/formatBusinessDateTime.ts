/**
 * Форматирование дат/времени записей в явной IANA-таймзоне (без зависимости от TZ процесса Node / браузера).
 */

const MSK_WALL_OFFSET = "+03:00";

/**
 * Разбор ISO-момента для отображения.
 * Строки без Z и без ±offset (как раньше отдавал integrator scheduleNormalizer) нельзя
 * кормить в `new Date` напрямую — в Node и в браузере это разный instant. Для
 * `Europe/Moscow` такие значения трактуем как настенное время MSK (как слоты Rubitime).
 */
export function parseBusinessInstant(iso: string, displayTimeZone: string): Date {
  const t = iso.trim();
  if (!t) return new Date(NaN);
  if (/Z$/i.test(t) || /[+-]\d{2}:\d{2}$/.test(t)) return new Date(t);
  if (
    displayTimeZone === "Europe/Moscow" &&
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?$/.test(t)
  ) {
    return new Date(`${t}${MSK_WALL_OFFSET}`);
  }
  return new Date(t);
}

export function formatBookingDateTimeMediumRu(iso: string, timeZone: string): string {
  const d = parseBusinessInstant(iso, timeZone);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone });
}

export function formatBookingTimeShortRu(iso: string, timeZone: string): string {
  const d = parseBusinessInstant(iso, timeZone);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** Дата слова́ми (как в сводке подтверждения записи), в бизнес-таймзоне. */
export function formatBookingDateLongRu(iso: string, timeZone: string): string {
  const d = parseBusinessInstant(iso, timeZone);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
}

/**
 * Дата как `д.м.гггг` (как в кабинете пациента), в бизнес-таймзоне.
 * Заменяет `formatRuAppointmentDate` без TZ — тот зависел от TZ процесса Node.
 */
export function formatAppointmentDateNumericRu(
  iso: string | Date | null | undefined,
  timeZone: string,
): string {
  if (iso == null) return "—";
  const d = typeof iso === "string" ? parseBusinessInstant(iso, timeZone) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
    timeZone,
  });
}

/** Время `ЧЧ:мм` в бизнес-таймзоне (как в кабинете пациента). */
export function formatAppointmentTimeShortRu(
  iso: string | Date | null | undefined,
  timeZone: string,
): string {
  if (iso == null) return "—";
  const s = typeof iso === "string" ? iso : iso.toISOString();
  const d = parseBusinessInstant(s, timeZone);
  if (Number.isNaN(d.getTime())) return "—";
  return formatBookingTimeShortRu(s, timeZone);
}

/**
 * Как в списке врача: `HH:mm DD.MM` в бизнес-таймзоне (раньше ошибочно брался UTC).
 */
export function formatDoctorAppointmentRecordAt(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = parseBusinessInstant(iso, timeZone);
  if (Number.isNaN(d.getTime())) return "";
  const fmt = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "";
  return `${get("hour")}:${get("minute")} ${get("day")}.${get("month")}`;
}
