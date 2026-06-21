import { getDoctorEffectiveCalendarIana } from "@/modules/doctor-calendar-timezone/doctorCalendarTimezone";
import { pgDoctorCalendarTimezonePort } from "@/infra/repos/pgDoctorCalendarTimezone";

/**
 * App-layer facade: resolve a doctor's effective calendar timezone (IANA).
 *
 * Route handlers must NOT import infra/repos directly (no-restricted-imports lint rule),
 * so they call this facade, which wires the pg port into the resolver. The resolver's
 * fallback chain: personal `platform_users.calendar_timezone` ?? branch ?? app_display_timezone.
 */
export function resolveDoctorCalendarIana(
  doctorUserId: string,
  branchRaw?: string | null,
): Promise<string> {
  return getDoctorEffectiveCalendarIana(doctorUserId, pgDoctorCalendarTimezonePort, branchRaw);
}
