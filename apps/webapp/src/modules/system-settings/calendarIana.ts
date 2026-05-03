/** Pure IANA helpers — без DB/env; безопасно для импорта из client components. */

/** Дефолт совпадает с integrator `DEFAULT_APP_DISPLAY_TIMEZONE`. */
export const DEFAULT_APP_DISPLAY_TIMEZONE = "Europe/Moscow";

const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

function isValidIanaTimeZone(tz: string): boolean {
  const t = tz.trim();
  if (!t) return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: t });
    return true;
  } catch {
    return false;
  }
}

/** Нормализует сырое значение: допустимая IANA (regex + ICU) или дефолт. */
export function normalizeAppDisplayTimeZone(raw: string): string {
  const t = raw.trim();
  if (t.length > 0 && IANA_LIKE.test(t) && isValidIanaTimeZone(t)) return t;
  return DEFAULT_APP_DISPLAY_TIMEZONE;
}

/** Локальные сутки пациента: персональная IANA или нормализованный fallback приложения. */
export function resolveCalendarDayIanaForPatient(
  personalRaw: string | null | undefined,
  appDefaultRaw: string,
): string {
  const p = personalRaw?.trim() ?? "";
  if (p.length > 0 && IANA_LIKE.test(p) && isValidIanaTimeZone(p)) return p;
  return normalizeAppDisplayTimeZone(appDefaultRaw);
}

export function isAcceptableIanaTimezone(raw: string): boolean {
  const t = raw.trim();
  return t.length > 0 && IANA_LIKE.test(t) && isValidIanaTimeZone(t);
}
