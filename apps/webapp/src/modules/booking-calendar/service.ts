import type { BookingSchedulingPort } from "@/modules/booking-scheduling/ports";
import { localDateKey } from "@/modules/booking-scheduling/computeSlots";
import type { BookingCalendarPort, BookingCalendarService } from "./ports";
import type { ScheduleBlockRecord } from "@/modules/booking-scheduling/ports";
import type {
  CalendarAggregate,
  CalendarBlockEvent,
  CalendarFilters,
  CalendarFreeSlotEvent,
} from "./types";

type Deps = {
  calendarPort: BookingCalendarPort;
  listScheduleBlocks: (input: {
    organizationId: string;
    rangeStart: string;
    rangeEnd: string;
  }) => Promise<ScheduleBlockRecord[]>;
  schedulingPort?: BookingSchedulingPort;
};

function mapBlock(block: ScheduleBlockRecord): CalendarBlockEvent {
  return {
    kind: "block",
    id: block.id,
    startAt: block.startAt,
    endAt: block.endAt,
    blockType: block.blockType,
    title: block.title,
    specialistId: block.specialistId,
    branchId: block.branchId,
    roomId: block.roomId,
  };
}

function matchesOptionalFilter(value: string | null, filter: string | null | undefined): boolean {
  if (!filter) return true;
  return value === filter;
}

async function listFreeSlotEvents(
  filters: CalendarFilters,
  calendarPort: BookingCalendarPort,
  schedulingPort: BookingSchedulingPort,
): Promise<CalendarFreeSlotEvent[]> {
  if (!filters.includeFreeSlots || !filters.specialistId || !filters.branchId || !filters.serviceId) {
    return [];
  }
  const scheduling = await calendarPort.resolveSchedulingForSlots({
    organizationId: filters.organizationId,
    specialistId: filters.specialistId,
    branchId: filters.branchId,
    serviceId: filters.serviceId,
  });
  if (!scheduling) return [];

  const dateFrom = localDateKey(filters.rangeStart, scheduling.branchTimezone);
  const dateTo = localDateKey(filters.rangeEnd, scheduling.branchTimezone);
  const slotsByDate = await schedulingPort.getSlots({
    organizationId: filters.organizationId,
    branchId: filters.branchId,
    specialistId: filters.specialistId,
    roomId: filters.roomId ?? scheduling.roomId,
    serviceId: filters.serviceId,
    durationMinutes: scheduling.durationMinutes,
    branchTimezone: scheduling.branchTimezone,
    dateFrom,
    dateTo,
  });

  const events: CalendarFreeSlotEvent[] = [];
  for (const day of slotsByDate) {
    day.slots.forEach((slot, index) => {
      events.push({
        kind: "freeSlot",
        id: `free:${filters.specialistId}:${filters.branchId}:${filters.serviceId}:${slot.startAt}:${index}`,
        startAt: slot.startAt,
        endAt: slot.endAt,
        specialistId: filters.specialistId!,
        branchId: filters.branchId!,
        serviceId: filters.serviceId!,
      });
    });
  }
  return events;
}

export function createBookingCalendarService(deps: Deps): BookingCalendarService {
  return {
    async getCalendar(filters: CalendarFilters): Promise<CalendarAggregate> {
      const [appointmentEvents, blocks, filterMeta, freeSlots] = await Promise.all([
        deps.calendarPort.listAppointmentsInRange(filters),
        deps.listScheduleBlocks({
          organizationId: filters.organizationId,
          rangeStart: filters.rangeStart,
          rangeEnd: filters.rangeEnd,
        }),
        deps.calendarPort.listFilterMeta(filters.organizationId),
        deps.schedulingPort
          ? listFreeSlotEvents(filters, deps.calendarPort, deps.schedulingPort)
          : Promise.resolve([]),
      ]);

      const blockEvents = blocks
        .filter(
          (b) =>
            matchesOptionalFilter(b.specialistId, filters.specialistId)
            && matchesOptionalFilter(b.branchId, filters.branchId)
            && matchesOptionalFilter(b.roomId, filters.roomId),
        )
        .map(mapBlock);

      return {
        events: [...appointmentEvents, ...blockEvents, ...freeSlots],
        filters: filterMeta,
      };
    },
  };
}
