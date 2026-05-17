/** IANA из `Intl` в браузере; для передачи при регистрации / OAuth (опционально). */
export function getBrowserCalendarIanaForAuth(): string | undefined {
  if (typeof Intl === "undefined" || typeof Intl.DateTimeFormat === "undefined") return undefined;
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.trim().length > 0 ? tz.trim() : undefined;
  } catch {
    return undefined;
  }
}
