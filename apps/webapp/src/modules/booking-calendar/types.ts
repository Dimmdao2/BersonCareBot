import type { AppointmentStatus } from "@/modules/booking-engine/types";

/**
 * Режимы отображения календаря.
 * - "day"      — день (timeGridDay в FullCalendar)
 * - "week"     — неделя·сетка (timeGridWeek в FullCalendar; сохранён для backward-compat с URL)
 * - "weeklist" — неделя·лента (кастомный рендер, без часовой сетки)
 * - "month"    — месяц (dayGridMonth в FullCalendar)
 * - "3days"    — 3 дня (сегодня + 2 дня вперёд; часовая сетка); v26_1
 * - "feed"     — лента (бесконечный поток; диапазон задаётся явными from/to); v26_1
 */
export type CalendarViewMode = "day" | "week" | "weeklist" | "month" | "3days" | "feed";

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

/**
 * Границы рабочего времени для часовых видов (3 дня / Неделя) ±1 час.
 * Вычисляется из событий kind:"working" в видимом диапазоне.
 * null — рабочих интервалов нет; клиент должен взять дефолт (напр. 06:00–23:00).
 */
export type WorkingBounds = {
  /** Минимальное начало рабочего времени − 60 минут, зажатое в [0, 1440]. */
  minMinute: number;
  /** Максимальное окончание рабочего времени + 60 минут, зажатое в [0, 1440]. */
  maxMinute: number;
};

export type CalendarAggregate = {
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource: CalendarReadSource;
  showWorkingHours: boolean;
  /** Границы рабочего времени ±1ч для часовых видов. null если нет рабочих интервалов. */
  workingBounds: WorkingBounds | null;
};
