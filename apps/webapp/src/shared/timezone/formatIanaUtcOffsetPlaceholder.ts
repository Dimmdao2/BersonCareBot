/**
 * Строка вида `(UTC+03:00) Europe/Moscow` для подсказок (placeholder) без Luxon.
 * При невалидной IANA возвращает только идентификатор.
 */
export function formatIanaUtcOffsetPlaceholder(iana: string, at: Date = new Date()): string {
  const trimmed = iana.trim();
  if (!trimmed) return "";
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: trimmed,
      timeZoneName: "longOffset",
    }).formatToParts(at);
    const tzPart = parts.find((p) => p.type === "timeZoneName")?.value?.trim() ?? "";
    if (!tzPart) return trimmed;
    const normalized = tzPart.startsWith("GMT") ? tzPart.replace(/^GMT/i, "UTC") : tzPart;
    return `(${normalized}) ${trimmed}`;
  } catch {
    return trimmed;
  }
}
