import { isAcceptableIanaTimezone } from '@/modules/system-settings/calendarIana';

export type CalendarTimezoneFromDevicePort = Readonly<{
  readCurrent(userId: string): Promise<string | null>;
  writeChanged(userId: string, calendarTimezone: string): Promise<boolean>;
}>;

/**
 * Единственное правило синхронизации пояса человека с устройством.
 * Ролевые адаптеры отвечают только за допустимую DB-дверь чтения/записи.
 */
export async function syncCalendarTimezoneFromDevice(
  userId: string,
  raw: string | null,
  port: CalendarTimezoneFromDevicePort,
): Promise<boolean> {
  const candidate = raw?.trim() ?? '';
  if (!candidate || !isAcceptableIanaTimezone(candidate)) return false;
  if ((await port.readCurrent(userId)) === candidate) return false;
  return port.writeChanged(userId, candidate);
}
