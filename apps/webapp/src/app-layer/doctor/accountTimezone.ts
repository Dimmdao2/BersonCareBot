import {
  getPlatformUserCalendarTimezone,
  setPlatformUserCalendarTimezone,
} from "@/infra/repos/pgPlatformUserCalendarTimezone";

export async function getDoctorAccountTimezone(userId: string): Promise<string | null> {
  return getPlatformUserCalendarTimezone(userId);
}

export async function setDoctorAccountTimezone(userId: string, timezone: string): Promise<void> {
  await setPlatformUserCalendarTimezone(userId, timezone);
}
