/**
 * Read doctor calendar_timezone from platform_users.
 * Doctors (role = 'doctor' | 'admin') also store their personal calendar TZ in
 * platform_users.calendar_timezone — the same column used by patient clients.
 * No role filter here: we just read the value for the supplied userId.
 */
import { runWebappPgText } from "@/infra/db/runWebappSql";
import type { DoctorCalendarTimezonePort } from "@/modules/doctor-calendar-timezone/doctorCalendarTimezone";

/** Returns raw IANA string or null if unset / user not found. */
export async function getDoctorCalendarTimezoneIana(platformUserId: string): Promise<string | null> {
  const r = await runWebappPgText<{ calendar_timezone: string | null }>(
    `SELECT calendar_timezone FROM platform_users WHERE id = $1::uuid`,
    [platformUserId],
  );
  return r.rows[0]?.calendar_timezone ?? null;
}

/** Port adapter — satisfies DoctorCalendarTimezonePort. */
export const pgDoctorCalendarTimezonePort: DoctorCalendarTimezonePort = {
  getIanaForDoctor: getDoctorCalendarTimezoneIana,
};
