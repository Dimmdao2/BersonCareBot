import type { AppointmentStatus } from '@/modules/booking-engine/types';

/**
 * Режимы отображения календаря.
 * - "day"      — день (timeGridDay в FullCalendar)
 * - "week"     — неделя·сетка (timeGridWeek в FullCalendar; сохранён для backward-compat с URL)
 * - "month"    — месяц (dayGridMonth в FullCalendar)
 * - "3days"    — 3 дня (сегодня + 2 дня вперёд; часовая сетка); v26_1
 * - "feed"     — лента (бесконечный поток; диапазон задаётся явными from/to); v26_1
 */
export type CalendarViewMode = 'day' | 'week' | 'month' | '3days' | 'feed';

export type CalendarReadSource = 'canonical';

export type CalendarFilters = {
  organizationId: string;
  rangeStart: string;
  rangeEnd: string;
  timeZone?: string;
  specialistId?: string | null;
  branchId?: string | null;
  roomId?: string | null;
  serviceId?: string | null;
  /** Repository-only narrowing used to hydrate a paged appointment feed. */
  appointmentIds?: string[];
};

export type AppointmentFeedFilters = Omit<CalendarFilters, 'rangeStart' | 'rangeEnd'> & {
  rangeStart?: string;
  rangeEnd?: string;
  search?: string;
  includeCancelled?: boolean;
  order?: 'asc' | 'desc';
  limit: number;
  offset: number;
};

export type AppointmentFeedPage = {
  items: CalendarAppointmentEvent[];
  total: number;
  hasMore: boolean;
};

export type CalendarFilterOption = {
  id: string;
  label: string;
  /** Short display name (only populated for branch options, migration 0117). */
  shortLabel?: string | null;
  /** Hex color (only populated for branch options). */
  color?: string | null;
};

export type CalendarServiceFilterOption = CalendarFilterOption & {
  durationMinutes: number;
  availability: { specialistId: string; branchId: string }[];
};

export type CalendarFilterMeta = {
  specialists: CalendarFilterOption[];
  branches: CalendarFilterOption[];
  rooms: CalendarFilterOption[];
  services: CalendarServiceFilterOption[];
};

/**
 * APPT-DETAIL-11: сводка оплаты записи ровно в том объёме, который рисует карточка. Один и тот же
 * контракт наполняет первичный серверный payload деталей и обновление после платёжной мутации,
 * поэтому блок оплаты не «доезжает» вторым запросом и не меняет вид после первого рендера.
 */
export type CalendarAppointmentPaymentView = {
  /** null — запись не найдена в платёжном контуре; блок показывает «не оплачено» без суммы. */
  prepaymentQuote: { amountMinor: number; currency: string } | null;
  payment: { amountMinor: number; status: string } | null;
  totalMinor: number | null;
  manualPaidMinor: number;
  /** Tariff mechanic `payments`: без него блока оплаты у клиники нет вовсе. */
  paymentsEntitled: boolean;
  /** Настроенный провайдер за существующим контрактом счёта/ссылки. */
  onlinePaymentAvailable: boolean;
  /** Пациент `linked` к порталу, значит ссылка в чат реально дойдёт. */
  patientChatAvailable: boolean;
};

export type CalendarAppointmentEvent = {
  kind: 'appointment';
  id: string;
  startAt: string;
  endAt: string;
  status: AppointmentStatus;
  source: string;
  specialistId: string | null;
  specialistName: string | null;
  branchId: string | null;
  branchTitle: string | null;
  branchColor: string | null;
  roomId: string | null;
  roomTitle: string | null;
  serviceId: string | null;
  serviceTitle: string | null;
  platformUserId: string | null;
  patientName: string | null;
  patientOnSupport?: boolean;
  patientPhone: string | null;
  bookingStatus: string | null;
  paymentStatus: string | null;
  prepaymentPending: boolean;
  packageUsageRef: string | null;
  packageTitle: string | null;
  packageDisplayNumber: number | null;
  rescheduleCount: number;
  originalStartAt: string | null;
  formComments: { label: string; value: string }[];
  /**
   * APPT-DETAIL-11: основной комментарий записи приходит вместе с деталями. Пустая строка и
   * отсутствие комментария неразличимы для человека, поэтому оба состояния — `null`.
   */
  primaryComment: string | null;
  /**
   * APPT-DETAIL-11: `null` означает «сводка оплаты не сформирована» (нет пациента, платёжный
   * контур недоступен) — карточка в этом случае блок оплаты не рисует.
   */
  payment: CalendarAppointmentPaymentView | null;
};

export type CalendarBlockEvent = {
  kind: 'block';
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
  kind: 'working';
  id: string;
  startAt: string;
  endAt: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

export type CalendarBreakEvent = {
  kind: 'break';
  id: string;
  startAt: string;
  endAt: string;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
};

export type CalendarFreeSlotEvent = {
  kind: 'freeSlot';
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
