/** Форматирование даты/времени приёма для кабинета пациента (без секунд). */

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
