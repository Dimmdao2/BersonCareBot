import {
  getPlatformUserCalendarTimezone,
  trySetInitialPlatformUserCalendarTimezoneIfEmpty,
} from '@/infra/repos/pgPlatformUserCalendarTimezone';

export async function getDoctorAccountTimezone(userId: string): Promise<string | null> {
  return getPlatformUserCalendarTimezone(userId);
}

/**
 * Первичное определение пояса сотрудника устройством (§34). Ручной настройки пояса у человека нет —
 * см. `StaffCalendarTimezoneBootstrap`.
 */
export async function trySetInitialDoctorAccountTimezone(
  userId: string,
  browserCalendarIana: string | null,
): Promise<void> {
  await trySetInitialPlatformUserCalendarTimezoneIfEmpty(userId, browserCalendarIana);
}
