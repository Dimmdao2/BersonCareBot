/**
 * Форматирование дат/времени записей в явной IANA-таймзоне (без зависимости от TZ процесса Node / браузера).
 */

export function formatBookingDateTimeMediumRu(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short", timeZone });
}

export function formatBookingTimeShortRu(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit", timeZone });
}

/** Дата слова́ми (как в сводке подтверждения записи), в бизнес-таймзоне. */
export function formatBookingDateLongRu(iso: string, timeZone: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric", timeZone });
}

/**
 * Как в списке врача: `HH:mm DD.MM` в бизнес-таймзоне (раньше ошибочно брался UTC).
 */
export function formatDoctorAppointmentRecordAt(iso: string | null | undefined, timeZone: string): string {
  if (!iso) return "";
  const d = new Date(iso);
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
