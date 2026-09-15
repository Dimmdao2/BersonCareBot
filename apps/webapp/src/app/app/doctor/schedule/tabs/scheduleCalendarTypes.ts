import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { DoctorScheduleScopeBootstrap, DoctorScheduleScopeState } from '@/modules/doctor-schedule/scope';
import { DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS } from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import type { ScheduleCalendarFeedSnapshot } from '../scheduleCalendarBootstrapTypes';
import type { ScheduleCalV26View } from '../scheduleCalendarRange';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const API_BASE = '/api/doctor/booking-engine';
export const KPIS_API = '/api/doctor/schedule-kpis';
export const SCHEDULE_FILTERS_STORAGE_KEY = 'therapysto.doctor.schedule.filters.v1';
export const INACTIVE_TOOLBAR_BUTTON_CLASS = DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS;
export const CREATE_PANEL_REVEAL_DELAY_MS = 180;
export const APPOINTMENT_FEED_API = `${API_BASE}/appointments/feed`;
export const APPOINTMENT_FEED_PAGE_SIZE = 100;
export const APPOINTMENT_FEED_HISTORY_MONTHS = 3;

type ScheduleKpiNumberKey = Exclude<keyof ScheduleKpis, 'firstVisitIds'>;

export const KPI_FILTER_KEYS = [
  'futureInPeriod',
  'firstVisitInPeriod',
  'bySubscriptionInPeriod',
  'cancellationsInPeriod',
  'reschedulesInPeriod',
] as const satisfies readonly Exclude<ScheduleKpiNumberKey, 'recordsInPeriod'>[];

export type ScheduleKpiFilterKey = (typeof KPI_FILTER_KEYS)[number];

/** Стабильная пустая ссылка: подставляется вместо выбора, когда КПИ-плиток на странице нет. */
export const NO_KPI_FILTERS: ScheduleKpiFilterKey[] = [];

export type CachedScheduleFilters = {
  branchId: string | null;
  serviceId: string | null;
  scope: DoctorScheduleScopeState['scope'];
  specialistId: string | null;
  showCancelledAppointments: boolean;
  kpiFilters: ScheduleKpiFilterKey[];
};

// View types for the v26 calendar tab switcher (3days / weekgrid / month / day(drill-down))
// "feed" removed in batch-1
export type CalV26View = ScheduleCalV26View;

// Render mode: calendar (FullCalendar) or list (grouped by day)
export type RenderMode = 'calendar' | 'list';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type CalendarResponse = Omit<ScheduleCalendarFeedSnapshot, 'ok'> & {
  ok: boolean;
  error?: string;
};

export type AppointmentFeedResponse = {
  ok: boolean;
  items?: CalendarAppointmentEvent[];
  total?: number;
  hasMore?: boolean;
  error?: string;
};

export type CalendarDraftSlot = {
  start: string;
  end: string;
};

export const EMPTY_SCHEDULE_SCOPE_BOOTSTRAP: DoctorScheduleScopeBootstrap = {
  ownSpecialistId: null,
  canManageAllSpecialists: false,
  specialists: [],
};

// ---------------------------------------------------------------------------
// Helper: grid time selection (CAL-ACTION-01…10)
// ---------------------------------------------------------------------------

/**
 * A persisted time selection on the empty grid. It survives the contextual menu, feeds the
 * schedule mutations and the shared appointment form, and is what the visible FullCalendar
 * highlight represents.
 */
export type CalendarGridSelection = {
  /** Local day of the selection. */
  dateKey: string;
  /** Local minutes of the day. */
  startMinute: number;
  endMinute: number;
  startAt: Date;
  endAt: Date;
};

/** Which schedule layers the selection covers — decides the contextual menu actions. */
export type CalendarSelectionKind = 'working' | 'break' | 'mixed' | 'outside';

/** Actions the doctor contextual menu can offer for a grid selection. */
export type CalendarSelectionAction = 'create' | 'add-break' | 'open-for-booking';

export type OpenWorkingHoursDialogState = {
  branchId: string | null;
};

export const CALENDAR_SELECTION_ACTION_LABELS: Record<CalendarSelectionAction, string> = {
  create: 'Новая запись',
  'add-break': 'Добавить перерыв',
  'open-for-booking': 'Открыть для записи',
};

/** `be_working_days.breaks` is capped at 6 by the scheduling contract. */
export const MAX_WORKING_DAY_BREAKS = 6;

export const SELECTION_MUTATION_ERRORS: Record<string, string> = {
  invalid_interval: 'Выберите интервал времени.',
  empty_working_day: 'В этот день нет рабочего времени.',
  outside_working_hours: 'Перерыв должен быть внутри рабочего времени.',
  appointment_overlap: 'В выбранном интервале есть запись.',
  no_break_in_selection: 'В выбранном интервале нет перерыва.',
  multiple_branches:
    'В этот день назначено несколько филиалов — измените график в разделе «График работы».',
  foreign_specialist: 'График другого специалиста меняется в его расписании.',
  too_many_breaks: 'В дне уже максимум перерывов.',
};
