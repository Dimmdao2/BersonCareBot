import {
  getPlatformUserCalendarTimezone,
  syncPlatformUserCalendarTimezoneFromDevice,
} from '@/infra/repos/pgPlatformUserCalendarTimezone';

export async function getDoctorAccountTimezone(userId: string): Promise<string | null> {
  return getPlatformUserCalendarTimezone(userId);
}

/**
 * Пояс сотрудника догоняет устройство (§34): пишется и при первом входе, и после переезда. Ручной
 * настройки пояса у человека нет — см. `StaffCalendarTimezoneBootstrap`.
 */
export async function syncDoctorAccountTimezoneFromDevice(
  userId: string,
  browserCalendarIana: string | null,
): Promise<boolean> {
  return syncPlatformUserCalendarTimezoneFromDevice(userId, browserCalendarIana);
}
