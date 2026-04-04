import { getConfigValue } from "@/modules/system-settings/configAdapter";

/** Дефолт совпадает с integrator `DEFAULT_APP_DISPLAY_TIMEZONE`. */
export const DEFAULT_APP_DISPLAY_TIMEZONE = "Europe/Moscow";

const IANA_LIKE = /^[A-Za-z_]+(\/[A-Za-z_]+)*$/;

/** Same check as integrator `getAppDisplayTimezone` — reject ICU-invalid IDs admin could otherwise save. */
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

/**
 * Нормализует значение из `system_settings` / env: допустимая IANA (regex + ICU) или дефолт.
 */
export function normalizeAppDisplayTimeZone(raw: string): string {
  const t = raw.trim();
  if (t.length > 0 && IANA_LIKE.test(t) && isValidIanaTimeZone(t)) return t;
  return DEFAULT_APP_DISPLAY_TIMEZONE;
}

/**
 * IANA-таймзона для отображения «бизнес-времени» (записи, слоты) в webapp.
 * Хранится в `system_settings.app_display_timezone` (admin), фолбэк — MSK.
 */
export async function getAppDisplayTimeZone(): Promise<string> {
  const raw = await getConfigValue("app_display_timezone", DEFAULT_APP_DISPLAY_TIMEZONE);
  return normalizeAppDisplayTimeZone(raw);
}
