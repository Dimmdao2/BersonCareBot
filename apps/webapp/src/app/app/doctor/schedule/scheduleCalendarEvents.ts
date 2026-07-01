export const DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT = "doctor:schedule-calendar-refresh";

export function emitDoctorScheduleCalendarRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT));
}
