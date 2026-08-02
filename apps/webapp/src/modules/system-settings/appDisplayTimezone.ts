import { getPublicRuntimeValue } from '@/modules/system-settings/configAdapter';
import { isAcceptableIanaTimezone } from '@/modules/system-settings/calendarIana';
import { RuntimeSettingUnavailableError } from '@/modules/system-settings/runtimeSettingUnavailable';

export {
  DEFAULT_APP_DISPLAY_TIMEZONE,
  normalizeAppDisplayTimeZone,
  resolveCalendarDayIanaForPatient,
  isAcceptableIanaTimezone,
} from '@/modules/system-settings/calendarIana';

/**
 * IANA-таймзона для отображения «бизнес-времени» (записи, слоты) в webapp.
 * Хранится в `system_settings.app_display_timezone` (admin). Missing/invalid data is refusal, not a
 * compiled timezone substitution.
 */
export async function getAppDisplayTimeZone(): Promise<string> {
  const raw = await getPublicRuntimeValue('app_display_timezone', 'public_booking_config');
  const value = raw.trim();
  if (!isAcceptableIanaTimezone(value)) {
    throw new RuntimeSettingUnavailableError('app_display_timezone');
  }
  return value;
}
