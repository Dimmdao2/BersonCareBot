import type { BookingCalendarPort } from "@/modules/booking-calendar/ports";
import type { CalendarReadSource } from "@/modules/booking-calendar/types";

export function createBookingCalendarReadSwitchPort(input: {
  legacyPort: BookingCalendarPort;
  canonicalPort: BookingCalendarPort;
  resolveReadSource: () => Promise<CalendarReadSource>;
}): BookingCalendarPort {
  const pick = async (): Promise<BookingCalendarPort> => {
    const source = await input.resolveReadSource();
    if (source === "canonical") return input.canonicalPort;
    return input.legacyPort;
  };

  return {
    listAppointmentsInRange: async (filters) => (await pick()).listAppointmentsInRange(filters),
    listFilterMeta: async (organizationId) => input.canonicalPort.listFilterMeta(organizationId),
    resolveSchedulingForSlots: async (params) => input.canonicalPort.resolveSchedulingForSlots(params),
  };
}
