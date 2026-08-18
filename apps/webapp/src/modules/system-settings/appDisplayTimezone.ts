import { cache } from 'react';
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
 *
 * Один вопрос базе на запрос. Значение спрашивают из 69 мест, и одна страница легко спрашивает
 * дважды: `/app/doctor/schedule` берёт его сама и ещё раз через `getDoctorEffectiveCalendarIana`.
 * Каждый лишний вопрос — отдельная port-транзакция с установкой и снятием контекста.
 *
 * Почему ключа нет. Читается ГЛОБАЛЬНАЯ настройка: scope `admin`, `organization_id IS NULL`,
 * аудитория `public`, и `getEffective` выполняет её под явным bootstrap-принципалом
 * (`infra/repos/pgAppRuntimeSettings.ts`). Ни арендатор, ни принципал спрашивающего на ответ не
 * влияют, поэтому делить память нечем и протечь между клиниками нечему.
 *
 * Почему НЕ кэш между запросами. `react.cache` живёт ровно один серверный запрос: админ поменял
 * таймзону — следующий запрос спрашивает базу заново. Отказ (`RuntimeSettingUnavailableError`)
 * запоминается на тот же один запрос и точно так же не переживает его.
 */
export const getAppDisplayTimeZone = cache(async (): Promise<string> => {
  const raw = await getPublicRuntimeValue('app_display_timezone', 'public_booking_config');
  const value = raw.trim();
  if (!isAcceptableIanaTimezone(value)) {
    throw new RuntimeSettingUnavailableError('app_display_timezone');
  }
  return value;
});
