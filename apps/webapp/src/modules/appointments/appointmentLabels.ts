/**
 * Форматирование даты/времени приёма (без секунд), **без явной таймзоны** — зависит от TZ процесса Node/браузера.
 * Для слотов из БД / интегратора используйте `@/shared/lib/formatBusinessDateTime` и `getAppDisplayTimeZone()`.
 */

/** @deprecated Для слотов из БД используйте `formatAppointmentDateNumericRu` из `@/shared/lib/formatBusinessDateTime` и `getAppDisplayTimeZone()`. */
export function formatRuAppointmentDate(iso: string | Date | null | undefined): string {
  if (iso == null) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("ru-RU", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  });
}

/** @deprecated Для слотов из БД используйте `formatAppointmentTimeShortRu` из `@/shared/lib/formatBusinessDateTime` и `getAppDisplayTimeZone()`. */
export function formatRuAppointmentTime(iso: string | Date | null | undefined): string {
  if (iso == null) return "—";
  const d = typeof iso === "string" ? new Date(iso) : iso;
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleTimeString("ru-RU", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function appointmentRowLabel(
  dateLabel: string,
  timeLabel: string,
): string {
  if (dateLabel === "—" && timeLabel === "—") return "—";
  if (timeLabel === "—") return dateLabel;
  if (dateLabel === "—") return timeLabel;
  return `${dateLabel} ${timeLabel}`;
}
