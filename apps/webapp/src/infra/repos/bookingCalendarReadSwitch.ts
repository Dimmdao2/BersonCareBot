import type { DoctorAppointmentsReadSource } from "@/infra/repos/doctorAppointmentsReadSwitch";
import { parseDoctorAppointmentsReadSource } from "@/infra/repos/doctorAppointmentsReadSwitch";
import type { BookingCalendarPort } from "@/modules/booking-calendar/ports";

export { parseDoctorAppointmentsReadSource };
export type CalendarReadSource = DoctorAppointmentsReadSource;

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
