/**
 * Doctor calendar timezone resolution.
 *
 * Effective TZ fallback chain:
 *   1. platform_users.calendar_timezone for the logged-in doctor
 *   2. branch.timezone (passed in when available)
 *   3. app_display_timezone system setting
 *   4. "Europe/Moscow" hard-coded fallback
 *
 * The patient side uses resolveCalendarDayIanaForPatient from calendarIana.ts;
 * this is the analogous resolver for doctor-facing schedule/calendar code.
 */
import {
  normalizeAppDisplayTimeZone,
  isAcceptableIanaTimezone,
  DEFAULT_APP_DISPLAY_TIMEZONE,
} from "@/modules/system-settings/calendarIana";
import { getAppDisplayTimeZone } from "@/modules/system-settings/appDisplayTimezone";

export interface DoctorCalendarTimezonePort {
  /** Returns raw IANA from platform_users.calendar_timezone, or null if unset. */
  getIanaForDoctor(platformUserId: string): Promise<string | null>;
}

/**
 * Resolves the effective IANA timezone for a doctor's calendar view.
 *
 * @param personalRaw  - raw value from platform_users.calendar_timezone (may be null)
 * @param branchRaw    - optional branch.timezone from the booking catalog
 * @param appDefaultRaw - raw value from app_display_timezone system setting
 */
export function resolveDoctorCalendarIana(
  personalRaw: string | null | undefined,
  branchRaw: string | null | undefined,
  appDefaultRaw: string,
): string {
  const p = personalRaw?.trim() ?? "";
  if (p.length > 0 && isAcceptableIanaTimezone(p)) return p;

  const b = branchRaw?.trim() ?? "";
  if (b.length > 0 && isAcceptableIanaTimezone(b)) return b;

  return normalizeAppDisplayTimeZone(appDefaultRaw);
}

/**
 * Full async resolver: fetches the doctor's personal TZ from the DB port,
 * falls back through branchTimezone and app_display_timezone.
 *
 * @param doctorUserId  - platform_users.id of the logged-in doctor
 * @param port          - DB port for reading doctor calendar TZ
 * @param branchRaw     - optional IANA from the selected branch (may be null)
 */
export async function getDoctorEffectiveCalendarIana(
  doctorUserId: string,
  port: DoctorCalendarTimezonePort,
  branchRaw?: string | null,
): Promise<string> {
  const [personalRaw, appDefaultRaw] = await Promise.all([
    port.getIanaForDoctor(doctorUserId).catch(() => null),
    getAppDisplayTimeZone().catch(() => DEFAULT_APP_DISPLAY_TIMEZONE),
  ]);
  return resolveDoctorCalendarIana(personalRaw, branchRaw, appDefaultRaw);
}
