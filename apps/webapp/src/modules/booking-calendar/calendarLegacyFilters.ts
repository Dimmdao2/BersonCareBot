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

function calendarAppointmentSlotKey(event: CalendarAppointmentEvent): string {
  return `${event.startAt}|${event.patientPhone ?? ""}|${event.patientName ?? ""}`;
}

function isNativeProjectionCalendarId(id: string): boolean {
  return id.startsWith("be:");
}

/** Prefer Rubitime row over native `be:` projection when both represent the same slot. */
export function dedupeCalendarAppointmentsPreferLegacy(
  events: CalendarAppointmentEvent[],
): CalendarAppointmentEvent[] {
  const bySlot = new Map<string, CalendarAppointmentEvent[]>();
  for (const event of events) {
    const key = calendarAppointmentSlotKey(event);
    const group = bySlot.get(key) ?? [];
    group.push(event);
    bySlot.set(key, group);
  }

  const out: CalendarAppointmentEvent[] = [];
  for (const group of bySlot.values()) {
    const rubitimeRows = group.filter((e) => !isNativeProjectionCalendarId(e.id));
    if (rubitimeRows.length > 0) {
      const preferred =
        rubitimeRows.find((e) => e.source === "rubitime_legacy") ?? rubitimeRows[0]!;
      out.push(preferred);
      continue;
    }
    const byId = new Map<string, CalendarAppointmentEvent>();
    for (const event of group) {
      const existing = byId.get(event.id);
      if (!existing || event.source === "rubitime_legacy") {
        byId.set(event.id, event);
      }
    }
    out.push(...byId.values());
  }
  return out;
}
