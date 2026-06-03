/** Префиксы в `summary` события Google Calendar (перед ФИО клиента). */
export const GCAL_SUMMARY_CANCELLED_PREFIX = "❌ ";
export const GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX = "⚠️ ";
export const GCAL_SUMMARY_PACKAGE_PREFIX = "✅ ";

export type GoogleCalendarTitleMarker = "none" | "cancelled" | "reschedule_pending";

const MARKER_PREFIXES = [
  GCAL_SUMMARY_CANCELLED_PREFIX,
  GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX,
  GCAL_SUMMARY_PACKAGE_PREFIX,
] as const;

/** Убирает известные маркеры из начала имени (идемпотентно). */
export function stripGoogleCalendarSummaryMarkers(clientName: string): string {
  let name = clientName.trim();
  for (;;) {
    const hit = MARKER_PREFIXES.find((p) => name.startsWith(p));
    if (!hit) break;
    name = name.slice(hit.length).trimStart();
  }
  return name || "Клиент";
}

/** Заголовок события: только ФИО (без услуги), с опциональным маркером отмены/переноса. */
export function buildGoogleCalendarSummary(
  clientName: string | undefined,
  _serviceTitle: string | undefined,
  marker: GoogleCalendarTitleMarker,
  packageLinked = false,
): string {
  const base = stripGoogleCalendarSummaryMarkers(clientName?.trim() || "Клиент");
  const statusPrefix =
    marker === "cancelled"
      ? GCAL_SUMMARY_CANCELLED_PREFIX
      : marker === "reschedule_pending"
        ? GCAL_SUMMARY_RESCHEDULE_PENDING_PREFIX
        : "";
  const packagePrefix = packageLinked ? GCAL_SUMMARY_PACKAGE_PREFIX : "";
  return `${statusPrefix}${packagePrefix}${base}`;
}
