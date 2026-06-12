import type { AppointmentStatus } from "@/modules/booking-engine/types";

/**
 * Режимы отображения календаря.
 * - "day"      — день (timeGridDay в FullCalendar)
 * - "week"     — неделя·сетка (timeGridWeek в FullCalendar; сохранён для backward-compat с URL)
 * - "weeklist" — неделя·лента (кастомный рендер, без часовой сетки)
 * - "month"    — месяц (dayGridMonth в FullCalendar)
 */
export type CalendarViewMode = "day" | "week" | "weeklist" | "month";

export type CalendarReadSource = "canonical" | "rubitime_legacy";

export type CalendarFilters = {
  organizationId: string;
  rangeStart: string;
  rangeEnd: string;
  timeZone?: string;
  specialistId?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  serviceId?: string | null;
  includeFreeSlots?: boolean;
};

export type CalendarFilterOption = {
  id: string;
  label: string;
  /** Short display name (only populated for branch options, migration 0117). */
  shortLabel?: string | null;
};

export type CalendarServiceFilterOption = CalendarFilterOption & { durationMinutes: number };

export type CalendarFilterMeta = {
  specialists: CalendarFilterOption[];
  branches: CalendarFilterOption[];
  rooms: CalendarFilterOption[];
  services: CalendarServiceFilterOption[];
};

export type CalendarAppointmentEvent = {
  kind: "appointment";
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: string;
  specialistId: string | null;
  specialistName: string | null;
  branchId: string | null;
  branchTitle: string | null;
  roomId: string | null;
  roomTitle: string | null;
  serviceId: string | null;
  serviceTitle: string | null;
  platformUserId: string | null;
  patientName: string | null;
  patientPhone: string | null;
  bookingStatus: string | null;
  rubitimeId: string | null;
  rubitimeManageUrl: string | null;
  paymentStatus: string | null;
  prepaymentPending: boolean;
  packageUsageRef: string | null;
  packageTitle: string | null;
  rescheduleCount: number;
  originalStartAt: string | null;
  formComments: { label: string; value: string }[];
};

export type CalendarBlockEvent = {
  kind: "block";
  id: string;
  startAt: string;
  endAt: string;
  blockType: string;
  title: string | null;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

export type CalendarWorkingEvent = {
  kind: "working";
  id: string;
  startAt: string;
  endAt: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

export type CalendarBreakEvent = {
  kind: "break";
  id: string;
  startAt: string;
  endAt: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

export type CalendarFreeSlotEvent = {
  kind: "freeSlot";
  id: string;
  startAt: string;
  endAt: string;
  specialistId: string;
  branchId: string;
  serviceId: string;
};

export type CalendarEvent =
  | CalendarAppointmentEvent
  | CalendarBlockEvent
  | CalendarWorkingEvent
  | CalendarBreakEvent
  | CalendarFreeSlotEvent;

export type CalendarAggregate = {
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource: CalendarReadSource;
  showWorkingHours: boolean;
};
