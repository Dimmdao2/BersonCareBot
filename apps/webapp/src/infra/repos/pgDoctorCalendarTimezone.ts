/**
 * Read doctor calendar_timezone from platform_users.
 * Doctors (role = 'doctor' | 'admin') also store their personal calendar TZ in
 * platform_users.calendar_timezone — the same column used by patient clients.
 * No role filter here: we just read the value for the supplied userId.
 */
import { eq } from 'drizzle-orm';
import { platformUsers } from '../../../db/schema/schema';
import { getWebappSqlDb } from '@/infra/db/runWebappSql';
import type { DoctorCalendarTimezonePort } from '@/modules/doctor-calendar-timezone/doctorCalendarTimezone';

/** Returns raw IANA string or null if unset / user not found. */
export async function getDoctorCalendarTimezoneIana(
  platformUserId: string,
): Promise<string | null> {
  const rows = await getWebappSqlDb()
    .select({ calendarTimezone: platformUsers.calendarTimezone })
    .from(platformUsers)
    .where(eq(platformUsers.id, platformUserId))
    .limit(1);
  return rows[0]?.calendarTimezone ?? null;
}

/** Port adapter — satisfies DoctorCalendarTimezonePort. */
export const pgDoctorCalendarTimezonePort: DoctorCalendarTimezonePort = {
  getIanaForDoctor: getDoctorCalendarTimezoneIana,
};
