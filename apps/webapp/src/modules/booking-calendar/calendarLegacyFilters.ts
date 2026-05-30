import type { CalendarAppointmentEvent, CalendarFilters } from "./types";

/** Soft scope match for Rubitime legacy rows (null scope = show under any filter). */
export function matchesLegacyAppointmentScopeFilter(
  event: CalendarAppointmentEvent,
  filters: CalendarFilters,
): boolean {
  if (filters.branchId && event.branchId && event.branchId !== filters.branchId) {
    return false;
  }
  if (filters.specialistId && event.specialistId && event.specialistId !== filters.specialistId) {
    return false;
  }
  if (filters.roomId && event.roomId && event.roomId !== filters.roomId) {
    return false;
  }
  if (filters.serviceId && event.serviceId && event.serviceId !== filters.serviceId) {
    return false;
  }
  return true;
}

/** Prefer legacy row when the same slot would appear twice (safety net for mixed sources). */
export function dedupeCalendarAppointmentsPreferLegacy(
  events: CalendarAppointmentEvent[],
): CalendarAppointmentEvent[] {
  const byKey = new Map<string, CalendarAppointmentEvent>();
  for (const event of events) {
    const key = `${event.startAt}|${event.patientPhone ?? event.patientName ?? event.id}`;
    const existing = byKey.get(key);
    if (!existing || event.source === "rubitime_legacy") {
      byKey.set(key, event);
    }
  }
  return [...byKey.values()];
}
