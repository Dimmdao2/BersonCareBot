import { getPublicRuntimeValue } from '@/modules/system-settings/configAdapter';
import {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  normalizeAppDisplayTimeZone,
} from '@/modules/system-settings/calendarIana';

export {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  normalizeAppDisplayTimeZone,
  resolveCalendarDayIanaForPatient,
  isAcceptableIanaTimezone,
} from '@/modules/system-settings/calendarIana';

/**
 * IANA-таймзона для отображения «бизнес-времени» (записи, слоты) в webapp.
 * Хранится в `system_settings.app_display_timezone` (admin), фолбэк — MSK.
 */
export async function getAppDisplayTimeZone(): Promise<string> {
  const raw = await getPublicRuntimeValue('app_display_timezone', 'public_booking_config');
  return normalizeAppDisplayTimeZone(raw);
}
