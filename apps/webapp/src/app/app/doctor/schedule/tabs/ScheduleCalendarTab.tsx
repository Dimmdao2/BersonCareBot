'use client';

import 'react-day-picker/style.css';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
  type CSSProperties,
} from 'react';
import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { CalendarDays, Columns3, Filter, List, Search } from 'lucide-react';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Button } from '@/shared/ui/doctor/primitives/button';
import { DoctorCatalogStickyToolbar } from '@/shared/ui/doctor/DoctorCatalogStickyToolbar';
import {
  DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
  buildDoctorCalendarNonWorkingRanges,
  doctorCalendarAppointmentBranchColors,
  doctorCalendarAppointmentClassName,
  doctorCalendarAppointmentDisplay,
  doctorCalendarBranchColorRgba,
  doctorCalendarNonWorkingClassNames,
  formatDoctorCalendarHour,
} from '@/shared/ui/doctor/calendar/doctorCalendarPresentation';
import {
  DOCTOR_ACTIVE_FILTER_BUTTON_CLASS,
  DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS,
  DoctorSchedulePeriodNav,
} from '@/shared/ui/doctor/calendar/DoctorSchedulePeriodNav';
import { DoctorAttentionBadge } from '@/shared/ui/doctor/DoctorAttentionBadge';
import { DoctorStatCard } from '@/app/app/doctor/analytics/clients/DoctorStatCard';
import { cn } from '@/lib/utils';
import { DEFAULT_APP_DISPLAY_TIMEZONE } from '@/modules/system-settings/calendarIana';
import type { PendingReschedule } from '../../calendar/DoctorCalendarRescheduleDialog';
import { DoctorCalendarToolbarFilter } from '../../calendar/DoctorCalendarToolbarFilter';
import { resolveCalendarCreateFieldValue } from '@/modules/booking-calendar/calendarCreateFieldMode';
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
} from '@/modules/booking-calendar/appointmentStatusLabels';
import type FullCalendar from '@fullcalendar/react';
import type { CalendarOptions as FullCalendarOptions, EventInput } from '@fullcalendar/core';
import type {
  CalendarAppointmentEvent,
  CalendarEvent,
  CalendarFilterMeta,
} from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { ScheduleTabProps } from '../scheduleTabRegistry';
import {
  DoctorModal,
  DoctorModalFooter,
  DoctorModalStackedTitle,
} from '@/shared/ui/doctor/DoctorModal';
import { DoctorResultCount } from '@/shared/ui/doctor/DoctorResultCount';
import { DoctorPanelLoading } from '@/shared/ui/doctor/DoctorPanelLoading';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { useDoctorPatientTerms } from '@/shared/ui/doctor/shell/DoctorPatientTermsContext';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@/shared/ui/doctor/primitives/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
} from '@/shared/ui/doctor/primitives/dropdown-menu';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { routePaths } from '@/app-layer/routes/paths';
import { DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT } from '../scheduleCalendarEvents';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import { patientCardHref } from '../../patients/patientCardHref';
import { DoctorAppointmentIndicators } from '../../calendar/DoctorAppointmentIndicators';
import { deriveCalendarInitialScrollTime } from '@/modules/booking-calendar/visibleTimeWindow';
import {
  addBreakToWorkingDay,
  intersectsAny,
  openWorkingDayIntervalForBooking,
  openWorkingHoursForSelection,
  type MinuteInterval,
} from '@/modules/booking-scheduling/workingDayBreakEdits';
import {
  doctorScheduleScopeQuery,
  resolveDoctorScheduleScopeState,
  type DoctorScheduleScopeBootstrap,
  type DoctorScheduleScopeState,
  type ResolvedDoctorScheduleScope,
} from '@/modules/doctor-schedule/scope';
import {
  isScheduleCalendarBootstrap,
  type ScheduleCalendarFeedSnapshot,
} from '../scheduleCalendarBootstrapTypes';
import {
  resolveScheduleCalAnchorDate,
  resolveScheduleCalView,
  visibleRange,
  type ScheduleCalV26View,
} from '../scheduleCalendarRange';
import {
  DEFAULT_CALENDAR_SETTINGS,
  parseCalendarDoctorSettings,
  type CalendarDoctorSettings,
} from '../scheduleCalendarSettings';
import { notificationText } from '@/shared/notifications/notificationText';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
type FullCalendarInstance = InstanceType<typeof FullCalendar>;

const DUPLICATE_CALENDAR_LOAD_WINDOW_MS = 2_000;

const DoctorCalendarEventPanel = dynamic(
  () =>
    import('../../calendar/DoctorCalendarEventPanel').then((mod) => mod.DoctorCalendarEventPanel),
  { ssr: false },
);

const DoctorCalendarRescheduleDialog = dynamic(
  () =>
    import('../../calendar/DoctorCalendarRescheduleDialog').then(
      (mod) => mod.DoctorCalendarRescheduleDialog,
    ),
  { ssr: false },
);

const ScheduleFullCalendarHost = dynamic(
  () => import('./ScheduleFullCalendarHost').then((mod) => mod.ScheduleFullCalendarHost),
  {
    ssr: false,
    loading: () => <DoctorPanelLoading className="min-h-[28rem]" />,
  },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api/doctor/booking-engine';
const KPIS_API = '/api/doctor/schedule-kpis';
const SCHEDULE_FILTERS_STORAGE_KEY = 'therapysto.doctor.schedule.filters.v1';
const INACTIVE_TOOLBAR_BUTTON_CLASS = DOCTOR_SCHEDULE_TOOLBAR_CONTROL_CLASS;
const CREATE_PANEL_REVEAL_DELAY_MS = 180;
const APPOINTMENT_FEED_API = `${API_BASE}/appointments/feed`;
const APPOINTMENT_FEED_PAGE_SIZE = 100;
const APPOINTMENT_FEED_HISTORY_MONTHS = 3;

type ScheduleKpiNumberKey = Exclude<keyof ScheduleKpis, 'firstVisitIds'>;

const KPI_FILTER_KEYS = [
  'futureInPeriod',
  'firstVisitInPeriod',
  'bySubscriptionInPeriod',
  'cancellationsInPeriod',
  'reschedulesInPeriod',
] as const satisfies readonly Exclude<ScheduleKpiNumberKey, 'recordsInPeriod'>[];

type ScheduleKpiFilterKey = (typeof KPI_FILTER_KEYS)[number];

/** Стабильная пустая ссылка: подставляется вместо выбора, когда КПИ-плиток на странице нет. */
const NO_KPI_FILTERS: ScheduleKpiFilterKey[] = [];

function isScheduleKpiFilterKey(value: string): value is ScheduleKpiFilterKey {
  return KPI_FILTER_KEYS.includes(value as ScheduleKpiFilterKey);
}

type CachedScheduleFilters = {
  branchId: string | null;
  serviceId: string | null;
  scope: DoctorScheduleScopeState['scope'];
  specialistId: string | null;
  showCancelledAppointments: boolean;
  kpiFilters: ScheduleKpiFilterKey[];
};

function readCachedScheduleFilters(): CachedScheduleFilters | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SCHEDULE_FILTERS_STORAGE_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
    const value = parsed as Record<string, unknown>;
    if (value.branchId !== null && typeof value.branchId !== 'string') return null;
    if (value.serviceId !== null && typeof value.serviceId !== 'string') return null;
    if (value.specialistId !== null && typeof value.specialistId !== 'string') return null;
    if (value.scope !== 'mine' && value.scope !== 'clinic' && value.scope !== 'specialist') {
      return null;
    }
    if (typeof value.showCancelledAppointments !== 'boolean') return null;
    const kpiFilters = Array.isArray(value.kpiFilters)
      ? [...new Set(value.kpiFilters.filter((key): key is string => typeof key === 'string'))].filter(
          isScheduleKpiFilterKey,
        )
      : [];
    return {
      branchId: value.branchId,
      serviceId: value.serviceId,
      scope: value.scope,
      specialistId: value.specialistId,
      showCancelledAppointments: value.showCancelledAppointments,
      kpiFilters,
    };
  } catch {
    return null;
  }
}

function writeCachedScheduleFilters(value: CachedScheduleFilters): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SCHEDULE_FILTERS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or exhausted storage: filters still work for the current page session.
  }
}

/** Stable client load identity — used to absorb SSR bootstrap across Strict Mode remounts. */
function scheduleCalendarLoadKey(parts: {
  view: string;
  anchorDate: string;
  branchId: string | null;
  serviceId: string | null;
  scope: DoctorScheduleScopeState['scope'];
  specialistId: string | null;
}): string {
  return [
    parts.view,
    parts.anchorDate,
    parts.branchId ?? '',
    parts.serviceId ?? '',
    parts.scope,
    parts.specialistId ?? '',
  ].join('\0');
}

// R34: понятные подписи ошибок переноса для диалога подтверждения.
function rescheduleErrorLabel(error: string | undefined): string {
  if (error?.startsWith('load_failed')) return notificationText.bookingRescheduleFailed;
  return errorCodeText(error, notificationText.bookingRescheduleFailed);
}

// View types for the v26 calendar tab switcher (3days / weekgrid / month / day(drill-down))
// "feed" removed in batch-1
type CalV26View = ScheduleCalV26View;

// Render mode: calendar (FullCalendar) or list (grouped by day)
type RenderMode = 'calendar' | 'list';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalendarResponse = Omit<ScheduleCalendarFeedSnapshot, 'ok'> & {
  ok: boolean;
  error?: string;
};

type AppointmentFeedResponse = {
  ok: boolean;
  items?: CalendarAppointmentEvent[];
  total?: number;
  hasMore?: boolean;
  error?: string;
};

type CalendarDraftSlot = {
  start: string;
  end: string;
};

const EMPTY_SCHEDULE_SCOPE_BOOTSTRAP: DoctorScheduleScopeBootstrap = {
  ownSpecialistId: null,
  canManageAllSpecialists: false,
  specialists: [],
};

// ---------------------------------------------------------------------------
// Helper: tolerant instant parse
// ---------------------------------------------------------------------------

/**
 * Толерантный парс мгновения из календарного фида.
 *
 * canonical-порт (`pgBookingCalendar`) отдаёт `startAt`/`endAt` прямо из
 * Postgres timestamptz — формат `"2026-06-13 10:00:00+02"` (пробел вместо `T`,
 * короткий offset). Это НЕ строгий ISO 8601: `DateTime.fromISO` его не парсит
 * (→ `Invalid`, `toISODate()` = null) — из-за чего «вид списком» был пуст,
 * хотя FullCalendar (через `new Date()`) такие записи показывал. Парсим
 * терпимо: ISO → SQL → нативный `Date`, затем приводим к нужной зоне.
 */
function parseFeedInstant(value: string, zone: string): DateTime {
  const iso = DateTime.fromISO(value, { setZone: true });
  if (iso.isValid) return iso.setZone(zone);
  const sql = DateTime.fromSQL(value, { setZone: true });
  if (sql.isValid) return sql.setZone(zone);
  return DateTime.fromJSDate(new Date(value)).setZone(zone);
}

/** Normalise a raw Postgres timestamptz string to a proper ISO 8601 string
 *  in the doctor's timezone so FullCalendar + luxon3 can parse it reliably. */
function toFcDate(value: string, zone: string): string {
  const dt = parseFeedInstant(value, zone);
  return dt.isValid ? (dt.toISO() ?? value) : value;
}

// ---------------------------------------------------------------------------
// Helper: grid time selection (CAL-ACTION-01…10)
// ---------------------------------------------------------------------------

/**
 * A persisted time selection on the empty grid. It survives the contextual menu, feeds the
 * schedule mutations and the shared appointment form, and is what the visible FullCalendar
 * highlight represents.
 */
type CalendarGridSelection = {
  /** Local day of the selection. */
  dateKey: string;
  /** Local minutes of the day. */
  startMinute: number;
  endMinute: number;
  startAt: Date;
  endAt: Date;
};

/** Which schedule layers the selection covers — decides the contextual menu actions. */
type CalendarSelectionKind = 'working' | 'break' | 'mixed' | 'outside';

/** Actions the doctor contextual menu can offer for a grid selection. */
type CalendarSelectionAction = 'create' | 'add-break' | 'open-for-booking';

type OpenWorkingHoursDialogState = {
  branchId: string | null;
};

const CALENDAR_SELECTION_ACTION_LABELS: Record<CalendarSelectionAction, string> = {
  create: 'Новая запись',
  'add-break': 'Добавить перерыв',
  'open-for-booking': 'Открыть для записи',
};

/** `be_working_days.breaks` is capped at 6 by the scheduling contract. */
const MAX_WORKING_DAY_BREAKS = 6;

/** Clips an event to one local day and expresses it in minutes of that day. */
function eventDayInterval(
  startAt: string,
  endAt: string,
  zone: string,
  dateKey: string,
): MinuteInterval | null {
  const dayStart = DateTime.fromISO(dateKey, { zone }).startOf('day');
  if (!dayStart.isValid) return null;
  const start = parseFeedInstant(startAt, zone);
  const end = parseFeedInstant(endAt, zone);
  if (!start.isValid || !end.isValid) return null;
  const startMinute = Math.max(0, Math.round(start.diff(dayStart, 'minutes').minutes));
  const endMinute = Math.min(1440, Math.round(end.diff(dayStart, 'minutes').minutes));
  if (endMinute <= startMinute) return null;
  return { startMinute, endMinute };
}

const SELECTION_MUTATION_ERRORS: Record<string, string> = {
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

// ---------------------------------------------------------------------------
// Helper: period label
// ---------------------------------------------------------------------------

/**
 * Границы видимого периода словами. `monthToken` — формат месяца люксона: `LLLL` (полное имя) для
 * подписи над КПИ, `LLL` (сокращение) для узкой кнопки периода в тулбаре.
 *
 * `to` в модели периода — начало следующего дня, поэтому последний включённый день на сутки раньше.
 */
function formatPeriodRange(
  view: CalV26View,
  anchorDate: string,
  zone: string,
  monthToken: 'LLLL' | 'LLL',
): string {
  const range = visibleRange(view, anchorDate, zone);
  const start = DateTime.fromISO(range.from, { zone }).setLocale('ru');
  const end = DateTime.fromISO(range.to, { zone }).minus({ days: 1 }).setLocale('ru');
  if (!start.isValid || !end.isValid) return '';
  if (start.hasSame(end, 'day')) return start.toFormat(`d ${monthToken} yyyy`);
  if (start.hasSame(end, 'month')) {
    return `${start.toFormat('d')} — ${end.toFormat(`d ${monthToken} yyyy`)}`;
  }
  if (start.hasSame(end, 'year')) {
    return `${start.toFormat(`d ${monthToken}`)} — ${end.toFormat(`d ${monthToken} yyyy`)}`;
  }
  return `${start.toFormat(`d ${monthToken} yyyy`)} — ${end.toFormat(`d ${monthToken} yyyy`)}`;
}

/**
 * Подпись кнопки периода в тулбаре. Владелец 15.09: «в кнопке с месяцем надо во всех размерах
 * экрана писать период: даты, месяц сокращенно и год» — раньше там стоял только месяц с годом
 * («Сентябрь 2026»), и по кнопке нельзя было понять, какие именно дни на экране.
 */
function periodNavLabel(view: CalV26View, anchorDate: string, zone: string): string {
  return formatPeriodRange(view, anchorDate, zone, 'LLL');
}

/**
 * Подпись кнопки периода в режиме списка. Владелец 15.09: «в режиме списка писать только дату
 * начала отображаемого списка и обновлять ее при прокрутке списка» — у непрерывной ленты нет
 * конца периода, поэтому показываем одну дату — ту, что сейчас наверху экрана.
 */
function listPeriodNavLabel(dateKey: string, zone: string): string {
  const day = DateTime.fromISO(dateKey, { zone }).setLocale('ru');
  return day.isValid ? day.toFormat('d LLL yyyy') : '';
}

/**
 * Подпись периода над КПИ-плитками: даты «с — по». Владелец 14.09 смотрел на числа плиток и не мог
 * понять, за что они посчитаны, — в режиме списка на экране месяцы, а считается видимый период.
 *
 * Берётся ИМЕННО `visibleRange` — та же функция, по которой КПИ уходят на сервер (`loadKpis`).
 * Любой другой источник рано или поздно разойдётся со счётом, и подпись начнёт врать. `to` в этой
 * модели — начало следующего дня, поэтому последний включённый день на сутки раньше.
 */
function kpiPeriodLabel(view: CalV26View, anchorDate: string, zone: string): string {
  const range = visibleRange(view, anchorDate, zone);
  const start = DateTime.fromISO(range.from, { zone }).setLocale('ru');
  const end = DateTime.fromISO(range.to, { zone }).minus({ days: 1 }).setLocale('ru');
  if (!start.isValid || !end.isValid) return '';
  if (start.hasSame(end, 'day')) return start.toFormat('d MMMM yyyy');
  if (start.hasSame(end, 'month')) return `${start.toFormat('d')} — ${end.toFormat('d MMMM yyyy')}`;
  if (start.hasSame(end, 'year')) {
    return `${start.toFormat('d MMMM')} — ${end.toFormat('d MMMM yyyy')}`;
  }
  return `${start.toFormat('d MMMM yyyy')} — ${end.toFormat('d MMMM yyyy')}`;
}

function capitalizeRussianLabel(label: string): string {
  return label ? `${label[0]?.toLocaleUpperCase('ru')}${label.slice(1)}` : label;
}

// ---------------------------------------------------------------------------
// Helper: resolve view from deep-link
// ---------------------------------------------------------------------------

const resolveView = resolveScheduleCalView;
const resolveAnchorDate = resolveScheduleCalAnchorDate;

function resolveRenderMode(raw: string | undefined): RenderMode {
  if (raw === 'list') return 'list';
  return 'calendar';
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, v);
  }
  return sp.toString();
}

function mergeAppointmentPages(...pages: CalendarAppointmentEvent[][]): CalendarAppointmentEvent[] {
  const byId = new Map<string, CalendarAppointmentEvent>();
  for (const item of pages.flat()) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ---------------------------------------------------------------------------
// Helper: event utilities
// ---------------------------------------------------------------------------

function eventClassName(event: CalendarEvent): string {
  // §3.7: фон/границу помечаем `!`-важными — в timeGrid FullCalendar красит событие
  // инлайн-стилем (синий по умолчанию), который перебивает обычные Tailwind-утилиты;
  // important-утилита выигрывает по каскаду (important author > inline). В month тоже
  // безопасно. Текст/пунктир/line-through оставляем обычными.
  if (event.kind === 'freeSlot')
    return '!bg-emerald-500/10 text-emerald-900 !border-emerald-500/30 border-dashed';
  if (event.kind === 'block') return '!bg-muted text-muted-foreground !border-border';
  // working: не рендерим (п.3), фон остаётся белым
  if (event.kind === 'working') return '';
  if (event.kind === 'break') return '!bg-slate-500/10 !border-transparent';
  // appointment: статусная палитра общая с мини-календарём «Сегодня».
  return doctorCalendarAppointmentClassName(event);
}

function eventTitle(event: CalendarEvent): string {
  if (event.kind === 'freeSlot') return 'Свободно';
  if (event.kind === 'working') return 'Рабочее время';
  if (event.kind === 'break') return 'Перерыв';
  if (event.kind === 'block') return event.title ?? 'Блокировка';
  const packagePrefix =
    event.packageUsageRef || event.packageTitle
      ? `${formatPatientPackageShortLabel(event.packageDisplayNumber)} `
      : '';
  const parts = [event.patientName ?? 'Запись', event.serviceTitle].filter(Boolean);
  return `${packagePrefix}${parts.join(' · ')}`;
}

/** Для месячного вида: только фамилия (первое слово) */
function eventLastName(event: CalendarEvent): string {
  if (event.kind !== 'appointment') return eventTitle(event);
  const packagePrefix =
    event.packageUsageRef || event.packageTitle
      ? `${formatPatientPackageShortLabel(event.packageDisplayNumber)} `
      : '';
  const name = event.patientName ?? 'Запись';
  return `${packagePrefix}${name.split(' ')[0] ?? name}`;
}

// ---------------------------------------------------------------------------
// KPI Row (D2)
// ---------------------------------------------------------------------------

const KPI_ITEMS: Array<{ key: ScheduleKpiFilterKey | 'recordsInPeriod'; label: string }> = [
  { key: 'recordsInPeriod', label: 'Записей всего' },
  { key: 'futureInPeriod', label: 'Впереди' },
  { key: 'firstVisitInPeriod', label: 'Первичных' },
  { key: 'bySubscriptionInPeriod', label: 'По абонементу' },
  { key: 'cancellationsInPeriod', label: 'Отмены' },
  { key: 'reschedulesInPeriod', label: 'Переносы' },
];

type KpiRowTabProps = {
  kpis: ScheduleKpis | null;
  kpisLoading: boolean;
  selectedKpiFilters: ScheduleKpiFilterKey[];
  periodLabel: string;
  onKpiClick?: (key: ScheduleKpiFilterKey | 'recordsInPeriod') => void;
};

function KpiRowTab({
  kpis,
  kpisLoading,
  selectedKpiFilters,
  periodLabel,
  onKpiClick,
}: KpiRowTabProps) {
  return (
    <div className="flex flex-col gap-2">
      {periodLabel ? (
        // Владелец 14.09: на десктопе/планшете над кнопками фильтров теперь есть отдельный блок
        // «Период» (в правой панели фильтров) — эта подпись стала бы дублем. Прячем её от `md` и
        // выше тем же брейкпоинтом, что делит мобильный тулбар и десктопный/планшетный; на
        // мобильном (<768, `useIsMobileViewport`) блока «Период» в панели фильтров нет — подпись
        // здесь остаётся единственным источником периода для КПИ и не трогается.
        <p className="px-0.5 text-xs text-muted-foreground md:hidden" data-testid="cal-kpi-period">
          Период: {periodLabel}
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-2" data-testid="cal-kpi-row">
      {KPI_ITEMS.map(({ key, label }) => {
        const value = kpis?.[key] ?? 0;
        // «Записей всего» — не обычный фильтр: она отражает состояние «фильтров нет» (выделена по
        // умолчанию, пока список не сужен) и по клику СБРАСЫВАЕТ остальные, а не добавляется к ним
        // (владелец 14.09: «нажатие на „Записей всего“ должно сбрасывать все остальные»; «карточка
        // должна быть выделяемая и с ободком, если вообще записи есть в периоде» — то есть ободок,
        // как у остальных плиток, появляется только при value > 0).
        const isRecordsTile = key === 'recordsInPeriod';
        const selected = isRecordsTile
          ? selectedKpiFilters.length === 0 && value > 0
          : selectedKpiFilters.includes(key);
        const handleClick =
          onKpiClick && (isRecordsTile ? selectedKpiFilters.length > 0 : selected || value > 0)
            ? () => onKpiClick(key)
            : undefined;
        return (
          <DoctorStatCard
            key={key}
            id={`kpi-${key}`}
            title={label}
            value={
              kpisLoading && kpis === null ? (
                <span className="text-sm text-muted-foreground">…</span>
              ) : (
                value
              )
            }
            onClick={handleClick}
            selected={selected}
            testId={`kpi-${key}`}
          />
        );
        })}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view — continuous, paged appointment feed grouped by month and day
// ---------------------------------------------------------------------------

type ListDayCardProps = {
  dateKey: string;
  label: string;
  appointments: CalendarAppointmentEvent[];
  timeZone: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  nextApptId?: string;
  branchShortLabels: ReadonlyMap<string, string>;
  showSpecialist: boolean;
};

// R29: фон строки списка повторяет статусную палитру календаря (eventClassName);
// прошедшие приглушаются, отменённые — destructive + line-through.
function listRowClass(appt: CalendarAppointmentEvent, timeZone: string): string {
  if (isCancelledAppointmentStatus(appt.status))
    return 'border-destructive/25 bg-destructive/10 text-destructive/80 hover:bg-destructive/15';
  const isPast = parseFeedInstant(appt.startAt, timeZone) < DateTime.now();
  const base = appt.branchColor
    ? 'border-[color:var(--list-branch-border)] bg-[color:var(--list-branch-bg)] text-foreground hover:brightness-[0.98]'
    : 'border-primary/30 bg-primary/10 hover:bg-primary/15';
  return cn(base, isPast && 'opacity-60');
}

function listRowStyle(appt: CalendarAppointmentEvent): CSSProperties | undefined {
  if (!appt.branchColor || isCancelledAppointmentStatus(appt.status)) return undefined;
  const background = doctorCalendarBranchColorRgba(appt.branchColor, 0.16);
  const border = doctorCalendarBranchColorRgba(appt.branchColor, 0.42);
  if (!background || !border) return undefined;
  return {
    '--list-branch-bg': background,
    '--list-branch-border': border,
    // Подпись филиала красится полным цветом — как часы филиала в «Графике работы». Заливка в 16%
    // сама по себе на телефоне не различается, из-за чего строки читались «одним цветом».
    '--list-branch-text': appt.branchColor,
  } as CSSProperties;
}

function ListDayCard({
  dateKey,
  label,
  appointments,
  timeZone,
  onSelect,
  nextApptId,
  branchShortLabels,
  showSpecialist,
}: ListDayCardProps) {
  return (
    // Владелец 14.09: «стандартный плоский список … заполнение так же как на мобиле, а
    // контейнер … как на десктопных клиентах / чатах» — раньше каждый день был своей
    // скруглённой карточкой (md:rounded-xl md:border md:p-3), а КАЖДАЯ запись внутри неё —
    // ЕЩЁ одной вложенной карточкой (md:rounded-md md:border). Теперь и день, и запись
    // плоские на всех брейкпоинтах (мобильное оформление); цветовую палитру по филиалу/
    // статусу (R29, listRowClass/listRowStyle) не трогаем — она остаётся волосяной нижней
    // границей и фоновой заливкой, просто без обводки со всех сторон и скругления.
    <div className="flex flex-col" data-testid={`list-day-${dateKey}`}>
      <p
        data-list-day-heading={dateKey}
        className="border-b border-border/60 px-[var(--doctor-list-inline-padding,18px)] py-2 text-sm font-semibold capitalize text-foreground"
      >
        {label}
      </p>
      <div className="flex flex-col">
        {appointments.map((appt) => {
          const start = parseFeedInstant(appt.startAt, timeZone).toFormat('HH:mm');
          const end = parseFeedInstant(appt.endAt, timeZone).toFormat('HH:mm');
          const cancelled = isCancelledAppointmentStatus(appt.status);
          const isNext = appt.id === nextApptId;
          const branchLabel = appt.branchId
            ? (branchShortLabels.get(appt.branchId) ?? appt.branchTitle)
            : appt.branchTitle;
          return (
            <Button
              key={appt.id}
              type="button"
              variant="ghost"
              onClick={() => onSelect(appt)}
              style={listRowStyle(appt)}
              className={cn(
                'flex h-auto min-h-0 w-full items-start gap-3 whitespace-normal rounded-none border-0 border-b border-border/60 px-[var(--doctor-list-inline-padding,18px)] py-2.5 text-left text-sm',
                listRowClass(appt, timeZone),
                // APPT-LIST-01: отметка ближайшей записи идёт ПОСЛЕ палитры строки — иначе
                // tailwind-merge считает `border-primary/30` из палитры конфликтующим и
                // выбрасывает цвет верхней линии. Нижняя линия остаётся обычным разделителем,
                // чтобы синей была ровно одна линия и только сверху.
                isNext ? 'border-t-2 !border-t-primary border-b-border/60' : '',
              )}
              data-testid={`list-appt-${appt.id}`}
            >
              <span className="flex w-[4.75rem] shrink-0 flex-col gap-0.5 overflow-hidden text-xs">
                <span className="whitespace-nowrap font-semibold tabular-nums">
                  {start}–{end}
                </span>
                {branchLabel ? (
                  <span
                    className={cn(
                      'truncate',
                      // Цвет филиала читается по подписи, а не только по бледной заливке строки.
                      // У отменённой записи своя палитра — её не перебиваем.
                      appt.branchColor && !cancelled
                        ? 'font-medium text-[color:var(--list-branch-text)]'
                        : 'text-muted-foreground',
                    )}
                    title={appt.branchTitle ?? undefined}
                  >
                    {branchLabel}
                  </span>
                ) : null}
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn('block truncate', cancelled && 'line-through')}>
                  {appt.patientName ?? 'Запись'}
                </span>
                <span className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                  {showSpecialist && appt.specialistName ? (
                    <span className="truncate">{appt.specialistName}</span>
                  ) : null}
                  {appt.serviceTitle ? <span className="truncate">{appt.serviceTitle}</span> : null}
                </span>
              </span>
              <DoctorAppointmentIndicators
                className="mt-0.5"
                deliveryFormat={appt.deliveryFormat}
                hasPackage={Boolean(appt.packageUsageRef || appt.packageTitle)}
                appointmentStatus={appt.status}
                paymentStatus={appt.payment?.payment?.status ?? appt.paymentStatus}
                paymentAmountMinor={appt.payment?.payment?.amountMinor}
                totalMinor={appt.payment?.totalMinor}
                manualPaidMinor={appt.payment?.manualPaidMinor}
                prepaymentRequiredMinor={appt.payment?.prepayment?.requiredMinor}
                prepaymentPaidMinor={appt.payment?.prepayment?.paidMinor}
                prepaymentPending={appt.prepaymentPending}
                prepaymentExpired={appt.prepaymentExpired}
              />
            </Button>
          );
        })}
      </div>
    </div>
  );
}

type ListViewProps = {
  appointments: CalendarAppointmentEvent[];
  anchorDate: string;
  timeZone: string;
  loading: boolean;
  loadingEarlier: boolean;
  loadingLater: boolean;
  hasEarlier: boolean;
  hasLater: boolean;
  onLoadEarlier: () => void;
  onLoadLater: () => void;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  branchShortLabels: ReadonlyMap<string, string>;
  showSpecialist: boolean;
  scrollToTodayRequest: number;
  /** Дата, которую лента показывает наверху экрана; обновляется при прокрутке (п.7). */
  onVisibleDateChange?: (dateKey: string) => void;
  /**
   * Счётчик полных перезагрузок ленты. Растёт, когда лента перезапрошена целиком (смена фильтров),
   * и заставляет заново встать на `anchorDate`: иначе после подмены всего массива записей браузер
   * оставляет прежний `scrollTop`, а он указывает уже в другое место (владелец 15.09, п.1).
   */
  repositionRequest: number;
};

function ListView({
  appointments,
  anchorDate,
  timeZone,
  loading,
  loadingEarlier,
  loadingLater,
  hasEarlier,
  hasLater,
  onLoadEarlier,
  onLoadLater,
  onSelect,
  branchShortLabels,
  showSpecialist,
  scrollToTodayRequest,
  onVisibleDateChange,
  repositionRequest,
}: ListViewProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const anchorMarkerRef = useRef<HTMLDivElement>(null);
  const earlierSentinelRef = useRef<HTMLDivElement>(null);
  const laterSentinelRef = useRef<HTMLDivElement>(null);
  const positionedAnchorRef = useRef<string | null>(null);
  const positionedTodayRequestRef = useRef(0);
  const positionedRepositionRef = useRef(0);
  const prependSnapshotRef = useRef<{ height: number; top: number } | null>(null);
  const dayGroups = useMemo<
    Array<{
      dateKey: string;
      label: string;
      monthKey: string;
      monthLabel: string;
      appointments: CalendarAppointmentEvent[];
    }>
  >(() => {
    const byDay = new Map<string, CalendarAppointmentEvent[]>();
    for (const appointment of appointments) {
      const dayKey = parseFeedInstant(appointment.startAt, timeZone).toISODate();
      if (!dayKey) continue;
      const group = byDay.get(dayKey) ?? [];
      group.push(appointment);
      byDay.set(dayKey, group);
    }
    return [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([dateKey, items]) => {
        const day = DateTime.fromISO(dateKey, { zone: timeZone }).setLocale('ru');
        return {
          dateKey,
          label: day.toFormat('cccc, d LLLL'),
          monthKey: day.toFormat('yyyy-MM'),
          monthLabel: capitalizeRussianLabel(day.toFormat('LLLL yyyy')),
          appointments: items.sort((a, b) => {
            const ac = isCancelledAppointmentStatus(a.status) ? 1 : 0;
            const bc = isCancelledAppointmentStatus(b.status) ? 1 : 0;
            if (ac !== bc) return ac - bc;
            return a.startAt.localeCompare(b.startAt);
          }),
        };
      });
  }, [appointments, timeZone]);

  // SCH-09: find first upcoming non-cancelled appointment across all day groups
  const now = DateTime.now().setZone(timeZone);
  let nextApptId: string | undefined;
  outer: for (const { appointments } of dayGroups) {
    for (const appt of appointments) {
      if (
        !isCancelledAppointmentStatus(appt.status) &&
        parseFeedInstant(appt.startAt, timeZone) > now
      ) {
        nextApptId = appt.id;
        break outer;
      }
    }
  }

  const firstGroupAtOrAfterAnchor = dayGroups.findIndex(({ dateKey }) => dateKey >= anchorDate);
  const anchorMarkerIndex =
    firstGroupAtOrAfterAnchor === -1
      ? Math.max(0, dayGroups.length - 1)
      : firstGroupAtOrAfterAnchor;

  useEffect(() => {
    const scrollNode = scrollRef.current;
    const markerNode = anchorMarkerRef.current;
    if (
      loading ||
      !scrollNode ||
      !markerNode ||
      (positionedAnchorRef.current === anchorDate &&
        positionedTodayRequestRef.current === scrollToTodayRequest &&
        positionedRepositionRef.current === repositionRequest)
    ) {
      return;
    }
    const isExplicitTodayRequest = scrollToTodayRequest > positionedTodayRequestRef.current;
    const frame = window.requestAnimationFrame(() => {
      // Владелец 14.09: наверху экрана должна быть ДАТА, а не строка ближайшей записи — «я вижу
      // весь сегодняшний день». Поэтому цель прокрутки всегда заголовок дня; отметка ближайшей
      // записи остаётся на своём месте как граница прошлого и будущего, но к ней не прокручиваем.
      const targetNode = markerNode;
      const targetTop =
        targetNode.getBoundingClientRect().top -
        scrollNode.getBoundingClientRect().top +
        scrollNode.scrollTop;
      scrollNode.scrollTo({
        top: Math.max(0, targetTop - 8),
        behavior: isExplicitTodayRequest ? 'smooth' : 'auto',
      });
      positionedAnchorRef.current = anchorDate;
      positionedTodayRequestRef.current = scrollToTodayRequest;
      positionedRepositionRef.current = repositionRequest;
    });
    return () => window.cancelAnimationFrame(frame);
  }, [anchorDate, loading, repositionRequest, scrollToTodayRequest]);

  useEffect(() => {
    const root = scrollRef.current;
    const earlier = earlierSentinelRef.current;
    const later = laterSentinelRef.current;
    if (!root || !earlier || !later || loading || typeof IntersectionObserver === 'undefined') {
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          if (
            entry.target === earlier &&
            positionedAnchorRef.current === anchorDate &&
            hasEarlier &&
            !loadingEarlier
          ) {
            prependSnapshotRef.current = { height: root.scrollHeight, top: root.scrollTop };
            onLoadEarlier();
          }
          if (entry.target === later && hasLater && !loadingLater) onLoadLater();
        }
      },
      { root, rootMargin: '240px 0px' },
    );
    observer.observe(earlier);
    observer.observe(later);
    return () => observer.disconnect();
  }, [
    anchorDate,
    hasEarlier,
    hasLater,
    loading,
    loadingEarlier,
    loadingLater,
    onLoadEarlier,
    onLoadLater,
  ]);

  useEffect(() => {
    const snapshot = prependSnapshotRef.current;
    const root = scrollRef.current;
    if (!snapshot || !root || loadingEarlier) return;
    root.scrollTop = snapshot.top + (root.scrollHeight - snapshot.height);
    prependSnapshotRef.current = null;
  }, [appointments.length, loadingEarlier]);

  /**
   * Какая дата сейчас наверху ленты (владелец 15.09, п.7: «в режиме списка писать только дату
   * начала отображаемого списка и обновлять ее при прокрутке списка»).
   *
   * Наблюдаем ЗАГОЛОВКИ ДНЕЙ, а не строки записей: их десятки, а не тысячи, и наблюдатель не
   * просыпается на каждый пиксель прокрутки. Из пересечённых берём последний, чья верхняя граница
   * уже ушла выше линии отсечки — это и есть день, чьи записи сейчас на экране. Результат уходит
   * наверх колбэком, который переписывает подпись кнопки напрямую в DOM, без состояния и без
   * перерисовки ленты.
   */
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !onVisibleDateChange || typeof IntersectionObserver === 'undefined') return;
    const headings = [...root.querySelectorAll<HTMLElement>('[data-list-day-heading]')];
    if (headings.length === 0) return;

    const report = () => {
      const rootTop = root.getBoundingClientRect().top;
      let current: string | null = null;
      for (const heading of headings) {
        // 12px — та же щель, что и при прокрутке к якорю (`targetTop - 8`) плюс запас на рамку;
        // без неё заголовок, стоящий ровно на границе, отдавал бы предыдущий день.
        if (heading.getBoundingClientRect().top - rootTop <= 12) {
          current = heading.dataset.listDayHeading ?? null;
        } else break;
      }
      const next = current ?? headings[0]?.dataset.listDayHeading ?? null;
      if (next) onVisibleDateChange(next);
    };

    const observer = new IntersectionObserver(report, {
      root,
      rootMargin: '0px 0px -85% 0px',
    });
    for (const heading of headings) observer.observe(heading);
    report();
    return () => observer.disconnect();
  }, [dayGroups, onVisibleDateChange]);

  return (
    // Владелец 14.09: контейнер списка — как на десктопных «Клиенты»/«Сообщения»/«Комментарии»
    // (`data-doctor-flat-list-surface`, edge-to-edge на мобильном, рамка+скругление от `md:`).
    // Раньше каждый день был своей карточкой с зазором (`md:gap-3`) между ними — теперь один
    // непрерывный список, дни разделяет собственный заголовок дня (`border-b` в `ListDayCard`).
    <div
      ref={scrollRef}
      data-doctor-flat-list-surface
      className="flex h-full min-h-0 flex-col overflow-y-auto rounded-none border-0 bg-card md:rounded-lg md:border md:border-border md:pr-1"
      data-testid="list-view"
    >
      <div ref={earlierSentinelRef} className="h-px" aria-hidden />
      {loadingEarlier ? <DoctorPanelLoading className="py-3" /> : null}
      {loading ? (
        <DoctorPanelLoading className="p-6" />
      ) : dayGroups.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          data-testid="list-empty"
        >
          Записей нет
        </div>
      ) : (
        <>
          {dayGroups.map(({ dateKey, label, appointments }, index) => (
            <Fragment key={dateKey}>
              {index === 0 || dayGroups[index - 1]?.monthKey !== dayGroups[index]?.monthKey ? (
                <p className="mt-2 border-t border-border/70 px-[var(--doctor-list-inline-padding,18px)] py-4 text-center text-base font-normal capitalize text-foreground">
                  {dayGroups[index]?.monthLabel}
                </p>
              ) : null}
              {/*
                Маркер прокрутки — ПОСЛЕ заголовка месяца, чтобы на первом дне месяца целью
                становился заголовок дня, а не заголовок месяца (аудит 14.09, Э1 FAIL).
              */}
              {index === anchorMarkerIndex ? <div ref={anchorMarkerRef} /> : null}
              <ListDayCard
                dateKey={dateKey}
                label={label}
                appointments={appointments}
                timeZone={timeZone}
                onSelect={onSelect}
                nextApptId={nextApptId}
                branchShortLabels={branchShortLabels}
                showSpecialist={showSpecialist}
              />
            </Fragment>
          ))}
        </>
      )}
      {loadingLater ? <DoctorPanelLoading className="py-3" /> : null}
      <div ref={laterSentinelRef} className="h-px" aria-hidden />
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleCalendarTab — главный компонент
// ---------------------------------------------------------------------------

/** Таб «Записи» раздела «Расписание» (v26 ребилд). */
export function ScheduleCalendarTab({
  deepLinkParams,
  onDeepLinkChange,
  initialData,
  isActive,
  initialTimeZone,
  scheduleScopeBootstrap,
  doctorStatisticsEnabled,
  createAppointmentRequestId,
  appointmentsManageOwn = true,
  availabilityManageOwn = true,
}: ScheduleTabProps) {
  const { patientSingularLabel, appointmentAccusative } = useDoctorPatientTerms();
  const bootstrap = isScheduleCalendarBootstrap(initialData) ? initialData : null;
  /** While current key equals SSR key, skip client load (survives Strict Mode remount). */
  const ssrLoadKeyRef = useRef(
    bootstrap
      ? scheduleCalendarLoadKey({
          view: bootstrap.view,
          anchorDate: bootstrap.anchorDate,
          branchId: bootstrap.branchId,
          serviceId: bootstrap.serviceId,
          scope: bootstrap.scheduleScope.scope,
          specialistId: bootstrap.scheduleScope.specialistId,
        })
      : null,
  );
  /** SSR settings stay authoritative — never clear, so Strict Mode remount does not refetch. */
  const settingsSeededRef = useRef(Boolean(bootstrap?.settings));
  const loadGenerationRef = useRef(0);
  const filterCacheRestoredRef = useRef(false);
  const calendarFilterOpenRef = useRef(false);
  const calendarFilterOpenVersionRef = useRef(0);
  const suppressCalendarInteractionUntilRef = useRef(0);
  const suppressCalendarDateClickUntilRef = useRef(0);
  const recentLoadRef = useRef<{ key: string; startedAt: number } | null>(null);
  const createPanelRevealTimerRef = useRef<number | null>(null);
  const handledCreateAppointmentRequestRef = useRef(0);
  const listFeedSeededRef = useRef(Boolean(bootstrap?.appointmentFeed));

  // ─── State ─────────────────────────────────────────────────────────────────
  const [timeZone] = useState(initialTimeZone ?? DEFAULT_APP_DISPLAY_TIMEZONE);
  const [view, setViewState] = useState<CalV26View>(
    () => bootstrap?.view ?? resolveView(deepLinkParams.view),
  );
  const [anchorDate, setAnchorDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const [mobileVisibleDate, setMobileVisibleDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const mobileVisibleDateRef = useRef(mobileVisibleDate);
  const [branchId, setBranchIdState] = useState<string | null>(
    () => bootstrap?.branchId ?? deepLinkParams.location ?? null,
  );
  const [serviceId, setServiceIdState] = useState<string | null>(
    () => bootstrap?.serviceId ?? deepLinkParams.service ?? null,
  );
  const scopeBootstrap = scheduleScopeBootstrap ?? EMPTY_SCHEDULE_SCOPE_BOOTSTRAP;
  const canManageAppointments = appointmentsManageOwn;
  const canManageAvailability = availabilityManageOwn;
  const [scheduleScope, setScheduleScope] = useState<DoctorScheduleScopeState>(
    () =>
      bootstrap?.scheduleScope ??
      resolveDoctorScheduleScopeState(
        scopeBootstrap,
        deepLinkParams.scope,
        deepLinkParams.specialist,
      ),
  );
  // drill-down: where to go back after drill-down day ("from" deep-link)
  const [drillBackView, setDrillBackView] = useState<CalV26View | null>(
    deepLinkParams.from ? (resolveView(deepLinkParams.from) ?? null) : null,
  );
  // Render mode: calendar or list
  const [renderMode, setRenderModeState] = useState<RenderMode>(() =>
    resolveRenderMode(deepLinkParams.render),
  );

  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(() => bootstrap?.calendar ?? null);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ScheduleKpis | null>(() => bootstrap?.kpis ?? null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [filtersPanelOpen, setFiltersPanelOpen] = useState(false);
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [showCancelledAppointments, setShowCancelledAppointments] = useState(false);
  const [selectedKpiFilters, setSelectedKpiFilters] = useState<ScheduleKpiFilterKey[]>([]);
  // КПИ-фильтр снимается той же плиткой, которой ставится. Если плиток на странице нет —
  // статистика организации выключена, а в кэше с прошлого раза лежит выбранный фильтр, — человек
  // получил бы урезанное расписание без единой возможности это отменить. Поэтому без плиток
  // фильтры не применяются вовсе: выбор в хранилище остаётся и оживёт вместе со статистикой.
  const showKpi = doctorStatisticsEnabled;
  const activeKpiFilters = showKpi ? selectedKpiFilters : NO_KPI_FILTERS;
  const [filterCacheReady, setFilterCacheReady] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const isWideScheduleLayout = useViewportMinWidth(1280);
  // #227: ref к FullCalendar для вызова unselect() при отмене создания
  const calendarRef = useRef<FullCalendarInstance>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [listAppointments, setListAppointments] = useState<CalendarAppointmentEvent[]>(
    () => bootstrap?.appointmentFeed?.items ?? [],
  );
  const [listTodayRequest, setListTodayRequest] = useState(0);
  const [listLoading, setListLoading] = useState(false);
  const [listLoadingEarlier, setListLoadingEarlier] = useState(false);
  const [listLoadingLater, setListLoadingLater] = useState(false);
  const [listHasEarlier, setListHasEarlier] = useState(true);
  const [listHasLater, setListHasLater] = useState(
    () => bootstrap?.appointmentFeed?.hasLater ?? true,
  );
  const [listPastBoundary, setListPastBoundary] = useState<string | null>(
    () => bootstrap?.appointmentFeed?.pastBoundary ?? null,
  );
  const [listFutureFrom, setListFutureFrom] = useState<string | null>(
    () => bootstrap?.appointmentFeed?.futureFrom ?? null,
  );
  const [listFutureOffset, setListFutureOffset] = useState(
    () => bootstrap?.appointmentFeed?.futureOffset ?? 0,
  );
  const [serverSearchItems, setServerSearchItems] = useState<CalendarAppointmentEvent[]>([]);
  const [serverSearchTotal, setServerSearchTotal] = useState<number | null>(null);
  const [serverSearchHasMore, setServerSearchHasMore] = useState(false);
  const [serverSearchLoading, setServerSearchLoading] = useState(false);
  const [serverSearchQuery, setServerSearchQuery] = useState<string | null>(null);
  const listLoadGenerationRef = useRef(0);
  /** Вид+якорь прошлого запроса ленты: отличает смену периода от перезапроса по смене фильтров. */
  const previousFeedKeyRef = useRef<string | null>(null);
  /** Дата, на которую лента должна встать после перезапроса по фильтрам (null — обычный якорь). */
  const [listScrollTargetDate, setListScrollTargetDate] = useState<string | null>(null);
  const [listRepositionRequest, setListRepositionRequest] = useState(0);
  // R32: время старта/конца, подставляемое в форму создания при выделении области.
  const [createInitialStart, setCreateInitialStart] = useState<string | null>(null);
  // #225: время конца из drag-интервала → используется как начальная длительность в форме создания.
  const [createInitialEnd, setCreateInitialEnd] = useState<string | null>(null);
  const [createInitialBranchId, setCreateInitialBranchId] = useState<string | null>(null);
  const [createInitialServiceId, setCreateInitialServiceId] = useState<string | null>(null);
  const [draftSlot, setDraftSlot] = useState<CalendarDraftSlot | null>(null);
  // CAL-ACTION-01: the grid selection outlives the tap that made it and drives the menu.
  const [gridSelection, setGridSelection] = useState<CalendarGridSelection | null>(null);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const [selectionActionError, setSelectionActionError] = useState<string | null>(null);
  const [selectionActionPending, setSelectionActionPending] = useState(false);
  const [openWorkingHoursDialog, setOpenWorkingHoursDialog] =
    useState<OpenWorkingHoursDialogState | null>(null);
  const selectionAnchorRectRef = useRef<{
    x: number;
    y: number;
    top: number;
    left: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  } | null>(null);
  const calendarViewportRef = useRef<HTMLDivElement | null>(null);
  /** Guards the programmatic `select()` of a single tap from re-entering `onSelect`. */
  const suppressSelectCallbackRef = useRef(false);
  const [createFormDirty, setCreateFormDirty] = useState(false);
  const lastSelectAtRef = useRef(0);
  const [calendarSettings, setCalendarSettings] = useState<CalendarDoctorSettings>(
    () => bootstrap?.settings ?? DEFAULT_CALENDAR_SETTINGS,
  );
  const [calendarLoading, setCalendarLoading] = useState(false);
  const [pending, startTransition] = useTransition();

  const calendarFeedRange = useMemo(
    () => visibleRange(view, anchorDate, timeZone),
    [anchorDate, timeZone, view],
  );
  // R34: подтверждение переноса (drag/resize) перед применением.
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const pendingRescheduleRef = useRef<{
    appointment: CalendarAppointmentEvent;
    arg: { revert: () => void };
    newStartAt: string;
    newEndAt: string;
  } | null>(null);
  const [rescheduleComment, setRescheduleComment] = useState('');
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  useEffect(() => {
    const mediaQuery = window.matchMedia('(min-width: 1280px)');
    const handleWideLayout = (event: MediaQueryListEvent) => {
      if (event.matches) setFiltersPanelOpen(false);
    };
    mediaQuery.addEventListener('change', handleWideLayout);
    return () => mediaQuery.removeEventListener('change', handleWideLayout);
  }, []);

  // ─── Sync state → deep-link ────────────────────────────────────────────────

  const setView = useCallback(
    (v: CalV26View) => {
      if (v === view) return;
      setCalendarLoading(true);
      setViewState(v);
      onDeepLinkChange('view', v);
    },
    [onDeepLinkChange, view],
  );

  const setAnchorDate = useCallback(
    (d: string) => {
      if (d === anchorDate) return;
      setCalendarLoading(true);
      setAnchorDateState(d);
      onDeepLinkChange('date', d);
    },
    [anchorDate, onDeepLinkChange],
  );

  const setBranchId = useCallback(
    (v: string | null) => {
      setBranchIdState(v);
      onDeepLinkChange('location', v);
    },
    [onDeepLinkChange],
  );

  const setServiceId = useCallback(
    (v: string | null) => {
      setServiceIdState(v);
      onDeepLinkChange('service', v);
    },
    [onDeepLinkChange],
  );

  const changeScheduleScope = useCallback(
    (scope: DoctorScheduleScopeState['scope'], specialistId?: string | null) => {
      const next = resolveDoctorScheduleScopeState(scopeBootstrap, scope, specialistId);
      setScheduleScope(next);
      setData(null);
      setKpis(null);
      setSelected(null);
      setShowCreatePanel(false);
      onDeepLinkChange('scope', next.scope);
      onDeepLinkChange('specialist', next.scope === 'specialist' ? next.specialistId : null);
    },
    [onDeepLinkChange, scopeBootstrap],
  );

  const setRenderMode = useCallback(
    (mode: RenderMode) => {
      setRenderModeState(mode);
      onDeepLinkChange('render', mode);
    },
    [onDeepLinkChange],
  );

  const updateMobileVisibleDate = useCallback((dateKey: string, commit = false) => {
    // Раньше здесь же переписывался текст кнопки периода форматом «месяц год». Владелец 15.09
    // (п.6) заменил формат на границы периода датами, и единственным источником подписи стал
    // `periodNavLabelText` при обычной перерисовке. Все вызовы этой функции и так меняют
    // `anchorDate`/`view`, то есть перерисовка следует сразу же; писать сюда второй, уже неверный
    // формат было бы прямым источником расхождения.
    mobileVisibleDateRef.current = dateKey;
    if (commit) {
      setMobileVisibleDateState((current) => (current === dateKey ? current : dateKey));
    }
  }, []);

  useEffect(() => {
    if (!isActive || !isMobileViewport || view !== 'weekgrid') return;
    queueMicrotask(() => {
      setCalendarLoading(true);
      setViewState('3days');
    });
  }, [isActive, isMobileViewport, view]);

  // ─── Drill-down day ────────────────────────────────────────────────────────

  const drillDownDay = useCallback(
    (dateKey: string) => {
      if (view === 'month') {
        setDrillBackView(null);
        onDeepLinkChange('from', null);
        updateMobileVisibleDate(dateKey, true);
        setView('3days');
        setAnchorDate(dateKey);
        return;
      }

      // Remember current view for Назад
      const backView = view === 'day' ? (drillBackView ?? '3days') : view;
      setDrillBackView(backView);
      onDeepLinkChange('from', backView);
      setView('day');
      setAnchorDate(dateKey);
    },
    [view, drillBackView, onDeepLinkChange, setView, setAnchorDate, updateMobileVisibleDate],
  );

  const drillBack = useCallback(() => {
    const back = drillBackView ?? '3days';
    setDrillBackView(null);
    onDeepLinkChange('from', null);
    setView(back);
  }, [drillBackView, onDeepLinkChange, setView]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadFeed = useCallback(
    (overrideView?: CalV26View, overrideAnchor?: string, generation?: number) => {
      const v = overrideView ?? view;
      const anchor = overrideAnchor ?? anchorDate;
      const gen = generation ?? ++loadGenerationRef.current;

      startTransition(async () => {
        try {
          const range = visibleRange(v, anchor, timeZone);
          const from = range.from;
          const to = range.to;

          // Map v26 view to API view param
          const apiView =
            v === '3days' ? '3days' : v === 'weekgrid' ? 'week' : v === 'month' ? 'month' : 'day';

          const qs = buildQuery({
            view: apiView,
            date: anchor,
            from,
            to,
            branchId,
            serviceId,
            ...doctorScheduleScopeQuery(scheduleScope),
          });
          const res = await fetch(`${API_BASE}/calendar?${qs}`);
          const raw = await res.text();
          if (gen !== loadGenerationRef.current) return;
          if (!raw.trim()) {
            setError(res.ok ? 'load_failed' : `load_failed_${res.status}`);
            return;
          }
          let json: CalendarResponse;
          try {
            json = JSON.parse(raw) as CalendarResponse;
          } catch {
            setError('load_failed');
            return;
          }
          if (gen !== loadGenerationRef.current) return;
          if (!res.ok || !json.ok) {
            setError(json.error ?? 'load_failed');
            return;
          }
          setData(json);
          setSelected((current) => {
            if (!current) return current;
            return (
              json.events.find(
                (event): event is CalendarAppointmentEvent =>
                  event.kind === 'appointment' && event.id === current.id,
              ) ?? current
            );
          });
          setError(null);
          // Do not write branchId/serviceId from feed into load-key state — that retriggers
          // load() in single-branch clinics. Create-form defaults resolve from filters on open.
        } catch {
          if (gen !== loadGenerationRef.current) return;
          setError('network_error');
        } finally {
          if (gen === loadGenerationRef.current) setCalendarLoading(false);
        }
      });
    },
    [view, anchorDate, branchId, serviceId, timeZone, scheduleScope],
  );

  // Отменённые нужны серверу только по одной причине — их попросили показать: переключателем
  // «показывать отмены» или КПИ-фильтром «Отмены». Зависимость именно от этого булева, а не от
  // всего списка выбранных КПИ: список меняет тождество на каждом нажатии плитки, и лента записей
  // перезапрашивалась бы двумя запросами даже там, где фильтр отрабатывает на клиенте.
  const includeCancelledAppointments =
    showCancelledAppointments || activeKpiFilters.includes('cancellationsInPeriod');
  const fetchAppointmentFeedPage = useCallback(
    async (params: {
      from?: string;
      to?: string;
      q?: string;
      order?: 'asc' | 'desc';
      limit?: number;
      offset?: number;
    }): Promise<AppointmentFeedResponse> => {
      const response = await fetch(
        `${APPOINTMENT_FEED_API}?${buildQuery({
          from: params.from,
          to: params.to,
          q: params.q,
          order: params.order,
          includeCancelled: String(includeCancelledAppointments),
          limit: String(params.limit ?? APPOINTMENT_FEED_PAGE_SIZE),
          offset: String(params.offset ?? 0),
          branchId,
          serviceId,
          ...doctorScheduleScopeQuery(scheduleScope),
        })}`,
      );
      const json = (await response.json()) as AppointmentFeedResponse;
      if (!response.ok || !json.ok) throw new Error(json.error ?? 'appointment_feed_load_failed');
      return json;
    },
    [branchId, includeCancelledAppointments, scheduleScope, serviceId],
  );

  /**
   * Владелец 15.09 (п.1): «после сброса или просто изменения фильтров календаря, в режиме списка
   * происходит сброс периода и переход к началу года или какой то произвольной дате в прошлом.
   * Исправить, должно оставаться там же где было».
   *
   * Причина: смена фильтра меняет тождество `fetchAppointmentFeedPage`, а с ним и этой функции —
   * лента перезапрашивается целиком и ВЕСЬ массив записей подменяется свежим окном вокруг
   * `anchorDate`. Всё, что человек долистал бесконечной прокруткой, при этом пропадает, высота
   * ленты схлопывается, а браузер оставляет прежний `scrollTop` — он и утыкается в начало
   * подгруженной истории, то есть «куда-то в прошлое».
   *
   * Лечение: если перезапрос вызван ТОЛЬКО сменой фильтров (вид и якорь те же), окно тянем вокруг
   * даты, которая сейчас на экране, и просим ленту заново встать на неё (`repositionRequest`).
   */
  const loadInitialAppointmentFeed = useCallback(async () => {
    const generation = ++listLoadGenerationRef.current;
    const feedKey = `${view}\u0000${anchorDate}`;
    const isFilterOnlyReload = previousFeedKeyRef.current === feedKey;
    previousFeedKeyRef.current = feedKey;
    const preservedDate = isFilterOnlyReload ? listVisibleDateRef.current : null;
    const rawAnchor = DateTime.fromISO(preservedDate ?? anchorDate, { zone: timeZone });
    const target =
      view === 'month' && !preservedDate ? rawAnchor.startOf('month') : rawAnchor.startOf('day');
    const historyStart = target.minus({ months: APPOINTMENT_FEED_HISTORY_MONTHS }).startOf('month');
    const targetIso = target.toUTC().toISO();
    const historyStartIso = historyStart.toUTC().toISO();
    if (!targetIso || !historyStartIso) return;

    setListLoading(true);
    setServerSearchQuery(null);
    setServerSearchItems([]);
    setServerSearchTotal(null);
    try {
      const [historyPage, futurePage] = await Promise.all([
        fetchAppointmentFeedPage({
          from: historyStartIso,
          to: target.minus({ milliseconds: 1 }).toUTC().toISO() ?? undefined,
          order: 'desc',
          limit: 200,
        }),
        fetchAppointmentFeedPage({ from: targetIso, order: 'asc' }),
      ]);
      if (generation !== listLoadGenerationRef.current) return;
      const historyItems = historyPage.items ?? [];
      const futureItems = futurePage.items ?? [];
      setListAppointments(mergeAppointmentPages(historyItems, futureItems));
      setListPastBoundary(historyStartIso);
      setListFutureFrom(targetIso);
      setListFutureOffset(futureItems.length);
      setListHasEarlier(true);
      setListHasLater(Boolean(futurePage.hasMore));
      setError(null);
      // Лента встала на новый массив — вернуть её туда, где человек был. Без этого эффект
      // позиционирования не проснётся: `anchorDate` не менялся, и его собственный сторож
      // (`positionedAnchorRef`) считает работу уже сделанной.
      setListScrollTargetDate(preservedDate);
      setListRepositionRequest((current) => current + 1);
    } catch {
      if (generation === listLoadGenerationRef.current) setError('network_error');
    } finally {
      if (generation === listLoadGenerationRef.current) setListLoading(false);
    }
  }, [anchorDate, fetchAppointmentFeedPage, timeZone, view]);

  const loadEarlierAppointments = useCallback(async () => {
    if (!listPastBoundary || listLoadingEarlier || !listHasEarlier) return;
    const boundary = DateTime.fromISO(listPastBoundary, { setZone: true });
    const previousBoundary = boundary
      .minus({ months: APPOINTMENT_FEED_HISTORY_MONTHS })
      .startOf('month');
    const from = previousBoundary.toUTC().toISO();
    const to = boundary.minus({ milliseconds: 1 }).toUTC().toISO();
    if (!from || !to) return;
    setListLoadingEarlier(true);
    try {
      const page = await fetchAppointmentFeedPage({ from, to, order: 'desc', limit: 200 });
      const items = page.items ?? [];
      setListAppointments((current) => mergeAppointmentPages(items, current));
      setListPastBoundary(from);
      setListHasEarlier(items.length > 0);
    } catch {
      setError('network_error');
    } finally {
      setListLoadingEarlier(false);
    }
  }, [fetchAppointmentFeedPage, listHasEarlier, listLoadingEarlier, listPastBoundary]);

  const loadLaterAppointments = useCallback(async () => {
    if (!listFutureFrom || listLoadingLater || !listHasLater) return;
    setListLoadingLater(true);
    try {
      const page = await fetchAppointmentFeedPage({
        from: listFutureFrom,
        order: 'asc',
        offset: listFutureOffset,
      });
      const items = page.items ?? [];
      setListAppointments((current) => mergeAppointmentPages(current, items));
      setListFutureOffset((current) => current + items.length);
      setListHasLater(Boolean(page.hasMore));
    } catch {
      setError('network_error');
    } finally {
      setListLoadingLater(false);
    }
  }, [fetchAppointmentFeedPage, listFutureFrom, listFutureOffset, listHasLater, listLoadingLater]);

  const searchAllAppointments = useCallback(async () => {
    const query = searchQuery.trim();
    if (query.length < 3 || serverSearchLoading) return;
    setServerSearchLoading(true);
    try {
      const page = await fetchAppointmentFeedPage({ q: query, order: 'asc', limit: 200 });
      setServerSearchQuery(query);
      setServerSearchItems(page.items ?? []);
      setServerSearchTotal(page.total ?? 0);
      setServerSearchHasMore(Boolean(page.hasMore));
      setError(null);
    } catch {
      setError('network_error');
    } finally {
      setServerSearchLoading(false);
    }
  }, [fetchAppointmentFeedPage, searchQuery, serverSearchLoading]);

  const loadMoreSearchResults = useCallback(async () => {
    if (!serverSearchQuery || serverSearchLoading || !serverSearchHasMore) return;
    setServerSearchLoading(true);
    try {
      const page = await fetchAppointmentFeedPage({
        q: serverSearchQuery,
        order: 'asc',
        limit: 200,
        offset: serverSearchItems.length,
      });
      setServerSearchItems((current) => mergeAppointmentPages(current, page.items ?? []));
      setServerSearchHasMore(Boolean(page.hasMore));
    } catch {
      setError('network_error');
    } finally {
      setServerSearchLoading(false);
    }
  }, [
    fetchAppointmentFeedPage,
    serverSearchHasMore,
    serverSearchItems.length,
    serverSearchLoading,
    serverSearchQuery,
  ]);

  useEffect(() => {
    if (renderMode !== 'list') {
      // Выход из ленты обнуляет её «где я был». Иначе при следующем возврате в список перезапрос
      // с тем же видом и якорем выглядел бы как смена фильтра, и лента встала бы на прокрутку
      // прошлого сеанса вместо сегодняшнего дня — правило владельца 14.09 «переключившись из
      // месяца в список, вижу СЕГОДНЯ» держится именно на этом обнулении.
      previousFeedKeyRef.current = null;
      listVisibleDateRef.current = null;
      setListScrollTargetDate(null);
      return;
    }
    if (listFeedSeededRef.current) {
      listFeedSeededRef.current = false;
      return;
    }
    void loadInitialAppointmentFeed();
  }, [loadInitialAppointmentFeed, renderMode]);

  const loadKpis = useCallback(
    (v: CalV26View, anchor: string, generation?: number) => {
      if (!doctorStatisticsEnabled) return;

      const gen = generation ?? loadGenerationRef.current;
      const { from, to } = visibleRange(v, anchor, timeZone);
      setKpisLoading(true);

      void fetch(
        `${KPIS_API}?${buildQuery({
          from,
          to,
          branchId,
          serviceId,
          ...doctorScheduleScopeQuery(scheduleScope),
        })}`,
      )
        .then((res) => res.json())
        .then((json: { ok: boolean; kpis: ScheduleKpis }) => {
          if (gen !== loadGenerationRef.current) return;
          if (json.ok && json.kpis) setKpis(json.kpis);
        })
        .catch(() => {
          // Деградация: показываем последние известные KPI
        })
        .finally(() => {
          if (gen === loadGenerationRef.current) {
            setKpisLoading(false);
          }
        });
    },
    [branchId, doctorStatisticsEnabled, serviceId, timeZone, scheduleScope],
  );

  // Parallel load: feed + kpis
  const load = useCallback(() => {
    const requestKey = [
      view,
      anchorDate,
      branchId ?? '',
      serviceId ?? '',
      scheduleScope.scope,
      scheduleScope.specialistId ?? '',
      renderMode,
      calendarFeedRange.from,
      calendarFeedRange.to,
    ].join('\0');
    const startedAt = Date.now();
    const recentLoad = recentLoadRef.current;
    if (
      recentLoad?.key === requestKey &&
      startedAt - recentLoad.startedAt < DUPLICATE_CALENDAR_LOAD_WINDOW_MS
    ) {
      return;
    }
    recentLoadRef.current = { key: requestKey, startedAt };
    const generation = ++loadGenerationRef.current;
    if (renderMode === 'calendar') {
      loadFeed(undefined, undefined, generation);
    }
    loadKpis(view, anchorDate, generation);
  }, [
    anchorDate,
    branchId,
    calendarFeedRange.from,
    calendarFeedRange.to,
    loadFeed,
    loadKpis,
    renderMode,
    scheduleScope.scope,
    scheduleScope.specialistId,
    serviceId,
    view,
  ]);

  useEffect(() => {
    if (settingsSeededRef.current) {
      return;
    }
    let cancelled = false;
    void fetch('/api/doctor/settings')
      .then((res) => (res.ok ? res.json() : null))
      .then(
        (json: { ok?: boolean; settings?: Array<{ key: string; valueJson: unknown }> } | null) => {
          if (cancelled || !json?.ok || !json.settings) return;
          setCalendarSettings(parseCalendarDoctorSettings(json.settings));
        },
      )
      .catch(() => {
        // Non-critical: keep built-in defaults.
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const calendarLoadKey = scheduleCalendarLoadKey({
    view,
    anchorDate,
    branchId,
    serviceId,
    scope: scheduleScope.scope,
    specialistId: scheduleScope.specialistId,
  });

  useEffect(() => {
    if (ssrLoadKeyRef.current !== null && calendarLoadKey === ssrLoadKeyRef.current) {
      return;
    }
    ssrLoadKeyRef.current = null;
    queueMicrotask(() => load());
  }, [calendarLoadKey, load]);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') load();
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') load();
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [load, isActive]);

  useEffect(() => {
    const handleRefresh = () => load();
    window.addEventListener(DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT, handleRefresh);
    return () => {
      window.removeEventListener(DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT, handleRefresh);
    };
  }, [load]);

  // ─── Period navigation ─────────────────────────────────────────────────────

  function shiftAnchor(delta: number) {
    const dt = DateTime.fromISO(anchorDate, { zone: timeZone });
    let next: string | null;
    if (view === 'month') {
      next = dt.plus({ months: delta > 0 ? 1 : -1 }).toISODate();
    } else if (view === 'weekgrid') {
      next = dt.plus({ days: delta * 7 }).toISODate();
    } else if (view === '3days') {
      next = dt.plus({ days: delta * 3 }).toISODate();
    } else {
      // day
      next = dt.plus({ days: delta }).toISODate();
    }
    if (next) {
      if (isMobileViewport) updateMobileVisibleDate(next, true);
      setAnchorDate(next);
    }
  }

  function goToday() {
    const today = DateTime.now().setZone(timeZone).toISODate();
    if (!today) return;
    updateMobileVisibleDate(today, true);
    setAnchorDate(today);
    if (renderMode === 'list') setListTodayRequest((current) => current + 1);
  }

  function jumpToDate(date: Date) {
    const dateKey = DateTime.fromObject(
      { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
      { zone: timeZone },
    ).toISODate();
    if (!dateKey) return;
    updateMobileVisibleDate(dateKey, true);
    setAnchorDate(dateKey);
    setDatePickerOpen(false);
  }

  // ─── Calendar events ───────────────────────────────────────────────────────

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  useEffect(() => {
    if (!data || filterCacheRestoredRef.current) return;
    const cached = readCachedScheduleFilters();
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled || filterCacheRestoredRef.current) return;
      filterCacheRestoredRef.current = true;
      if (cached) {
        if (!deepLinkParams.location) {
          setBranchIdState(
            cached.branchId && filters.branches.some((branch) => branch.id === cached.branchId)
              ? cached.branchId
              : null,
          );
        }
        if (!deepLinkParams.service) {
          setServiceIdState(
            cached.serviceId && filters.services.some((service) => service.id === cached.serviceId)
              ? cached.serviceId
              : null,
          );
        }
        if (!deepLinkParams.scope && !deepLinkParams.specialist) {
          const cachedScope = resolveDoctorScheduleScopeState(
            scopeBootstrap,
            cached.scope,
            cached.specialistId,
          );
          if (
            cachedScope.scope !== scheduleScope.scope ||
            cachedScope.specialistId !== scheduleScope.specialistId
          ) {
            setScheduleScope(cachedScope);
            setData(null);
            setKpis(null);
          }
        }
        setShowCancelledAppointments(cached.showCancelledAppointments);
        setSelectedKpiFilters(cached.kpiFilters);
      }
      setFilterCacheReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, [data, deepLinkParams, filters.branches, filters.services, scheduleScope, scopeBootstrap]);

  useEffect(() => {
    if (!filterCacheReady) return;
    writeCachedScheduleFilters({
      branchId,
      serviceId,
      scope: scheduleScope.scope,
      specialistId: scheduleScope.specialistId,
      showCancelledAppointments,
      kpiFilters: selectedKpiFilters,
    });
  }, [
    branchId,
    filterCacheReady,
    scheduleScope,
    selectedKpiFilters,
    serviceId,
    showCancelledAppointments,
  ]);

  const defaultCreateSpecialistId =
    calendarSettings.defaultSpecialistId &&
    filters.specialists.some((specialist) => specialist.id === calendarSettings.defaultSpecialistId)
      ? calendarSettings.defaultSpecialistId
      : null;

  const activeFilters = useMemo(
    () => ({
      specialistId: data?.resolvedScope.specialistId ?? scheduleScope.specialistId,
      branchId,
      roomId: null,
      serviceId,
    }),
    [branchId, data?.resolvedScope.specialistId, scheduleScope.specialistId, serviceId],
  );

  /**
   * Подпись «за какой период посчитаны плитки» — ровно тот диапазон, который уходит в КПИ.
   * `loadKpis` строит `from/to` по state `timeZone` (не по `data?.timeZone`) — подпись обязана
   * читать тот же источник пояса, иначе после смены пояса устройства она способна описывать не
   * тот интервал, по которому реально посчитаны числа (аудит 14.09, Э3 FAIL).
   */
  const kpiPeriod = useMemo(
    () => kpiPeriodLabel(view, anchorDate, timeZone),
    [anchorDate, timeZone, view],
  );

  /**
   * День, на который встаёт список при открытии. Владелец 14.09: переключившись на телефоне из
   * месяца в список, он должен увидеть СЕГОДНЯ, а не первое число месяца. Поэтому сегодняшний день
   * побеждает, когда он попадает в видимый период; осознанный уход в другой месяц при этом не
   * теряется — там сегодняшнего дня в периоде нет, и якорем остаётся его начало. Дальше список сам
   * встаёт на ближайший день С ЗАПИСЯМИ (`dateKey >= anchorDate`), то есть правило «сегодня, либо
   * день следующей записи» выполняется без отдельной ветки.
   */
  const listAnchorDate = useMemo(() => {
    const zone = data?.timeZone ?? timeZone;
    const range = visibleRange(view, anchorDate, zone);
    // Начало ВИДИМОГО периода для любого вида, не только `month` — иначе `weekgrid` на неделе,
    // отличной от anchor-недели, ставит якорь на день недели из `anchorDate` вместо понедельника
    // выбранной недели (аудит 14.09, Э1 FAIL).
    const periodStart = DateTime.fromISO(range.from, { zone }).toISODate() ?? anchorDate;
    const todayKey = DateTime.now().setZone(zone).toISODate();
    const fromKey = periodStart;
    // `to` в модели периода — начало следующего дня, то есть граница не включается.
    const toKey = DateTime.fromISO(range.to, { zone }).toISODate();
    if (!todayKey || !fromKey || !toKey) return periodStart;
    return todayKey >= fromKey && todayKey < toKey ? todayKey : periodStart;
  }, [anchorDate, data?.timeZone, timeZone, view]);
  const scheduleSpecialistOptions = useMemo(
    () =>
      scopeBootstrap.specialists.map((specialist) => ({
        id: specialist.id,
        label: specialist.displayLabel,
      })),
    [scopeBootstrap.specialists],
  );
  const selectedScheduleSpecialistId =
    scheduleScope.scope === 'clinic' ? null : scheduleScope.specialistId;
  const defaultScheduleScope = resolveDoctorScheduleScopeState(scopeBootstrap, null, null);
  const hasActiveScheduleFilters =
    branchId !== null ||
    serviceId !== null ||
    showCancelledAppointments ||
    activeKpiFilters.length > 0 ||
    scheduleScope.scope !== defaultScheduleScope.scope ||
    scheduleScope.specialistId !== defaultScheduleScope.specialistId;
  const handleCalendarFilterOpenChange = useCallback((open: boolean) => {
    const version = ++calendarFilterOpenVersionRef.current;
    if (open) {
      calendarFilterOpenRef.current = true;
      return;
    }
    queueMicrotask(() => {
      if (calendarFilterOpenVersionRef.current === version) {
        calendarFilterOpenRef.current = false;
      }
    });
  }, []);

  const renderScheduleFilters = (className: string, controlClassName?: string) => (
    <div className={className}>
      <DoctorCalendarToolbarFilter
        noneLabel="Все филиалы"
        options={filters.branches}
        value={branchId}
        onChange={setBranchId}
        onOpenChange={handleCalendarFilterOpenChange}
        className={controlClassName}
      />
      {scopeBootstrap.canManageAllSpecialists && scheduleSpecialistOptions.length > 1 ? (
        <DoctorCalendarToolbarFilter
          noneLabel="Все сотрудники"
          options={scheduleSpecialistOptions}
          value={selectedScheduleSpecialistId}
          onChange={(specialistId) =>
            specialistId
              ? changeScheduleScope('specialist', specialistId)
              : changeScheduleScope('clinic')
          }
          onOpenChange={handleCalendarFilterOpenChange}
          className={controlClassName}
        />
      ) : null}
      <DoctorCalendarToolbarFilter
        noneLabel="Все услуги"
        options={filters.services}
        value={serviceId}
        onChange={setServiceId}
        onOpenChange={handleCalendarFilterOpenChange}
        className={controlClassName}
      />
      {/* Владелец 15.09: «флажок показывать отмены расположить рядом с фразой а не в другом конце
          экрана» — переключатель прижат к подписи, а не разведён с ней по краям строки. */}
      <label className="flex h-8 w-full cursor-pointer items-center gap-2 px-1 text-sm text-foreground">
        <Switch
          checked={showCancelledAppointments}
          onCheckedChange={setShowCancelledAppointments}
          aria-label="Показывать отмены"
        />
        <span>Показывать отмены</span>
      </label>
    </div>
  );

  const currentTimeZone = data?.timeZone ?? timeZone;

  /**
   * Подпись периода живёт в двух-трёх экземплярах сразу (мобильный тулбар, панель в `<aside>`,
   * панель в модалке), а в режиме списка обязана обновляться НА КАЖДОЙ ПРОКРУТКЕ (владелец 15.09,
   * п.7). Гонять ради этого React-состояние нельзя: перерисовка ленты в сотни строк на каждом
   * шаге прокрутки — это заметный рывок. Поэтому кнопки регистрируют свои DOM-узлы здесь, и при
   * прокрутке текст переписывается напрямую (`textContent`), мимо React. В состояние дата
   * переезжает только когда прокрутка
   * остановилась, чтобы следующая штатная перерисовка не вернула устаревшую подпись.
   */
  const periodLabelNodesRef = useRef(new Map<string, HTMLButtonElement>());
  const periodLabelSettersRef = useRef(
    new Map<string, (node: HTMLButtonElement | null) => void>(),
  );
  const registerPeriodLabelNode = useCallback((key: string) => {
    const cached = periodLabelSettersRef.current.get(key);
    if (cached) return cached;
    const setter = (node: HTMLButtonElement | null) => {
      if (node) periodLabelNodesRef.current.set(key, node);
      else periodLabelNodesRef.current.delete(key);
    };
    periodLabelSettersRef.current.set(key, setter);
    return setter;
  }, []);

  const [listVisibleDate, setListVisibleDate] = useState<string | null>(null);
  const listVisibleDateRef = useRef<string | null>(null);
  const listVisibleCommitTimerRef = useRef<number | null>(null);

  const handleListVisibleDateChange = useCallback(
    (dateKey: string) => {
      if (listVisibleDateRef.current === dateKey) return;
      listVisibleDateRef.current = dateKey;
      const text = listPeriodNavLabel(dateKey, currentTimeZone);
      for (const node of periodLabelNodesRef.current.values()) node.textContent = text;
      if (listVisibleCommitTimerRef.current !== null) {
        window.clearTimeout(listVisibleCommitTimerRef.current);
      }
      listVisibleCommitTimerRef.current = window.setTimeout(() => {
        listVisibleCommitTimerRef.current = null;
        setListVisibleDate(dateKey);
      }, 200);
    },
    [currentTimeZone],
  );

  useEffect(
    () => () => {
      if (listVisibleCommitTimerRef.current !== null) {
        window.clearTimeout(listVisibleCommitTimerRef.current);
      }
    },
    [],
  );

  const scheduleViewOptions: Array<{ key: CalV26View | 'list'; label: string }> = [
    { key: '3days', label: '3 дня' },
    ...(isMobileViewport ? [] : [{ key: 'weekgrid' as const, label: 'Неделя' }]),
    { key: 'month', label: 'Месяц' },
    { key: 'list', label: 'Список' },
  ];

  /**
   * Владелец 14.09: «в десктопном и планшетном виде надо верхнюю панель перенести в правый блок
   * фильтров: сверху блок „Вид“ … ниже блок „Период“ … ниже уже идут фильтры». Блоки стоят над
   * `renderScheduleFilters` во ВСЕХ трёх местах, где живёт панель: постоянно открытом `<aside>`
   * (xl+) и модалке фильтров — и на планшете, и на мобильном (владелец 15.09: «в модалке
   * мобильного пусть будет так же две верхние строки — выбор периода на экране и режима»).
   *
   * «Список» — один из вариантов «Вид», отдельной иконки календаря нет. «Неделя» на мобильном не
   * предлагается (владелец 15.09: «только без недели») — недельная сетка там всё равно не живёт,
   * отдельный эффект разворачивает `weekgrid` обратно в `3days` на узком экране.
   *
   * Заголовки блоков скрыты на десктопе (`xl:hidden`, владелец 15.09) — в постоянно открытой
   * панели они лишний шум; в модалке (планшет и мобильный) остаются: там блоки идут подряд без
   * контекста страницы.
   */
  const renderScheduleTopBlocks = (slotKey: 'aside' | 'modal') => (
    <>
      <section className={doctorSectionCardClass}>
        <h2 className={cn(doctorSectionTitleClass, 'xl:hidden')}>Вид</h2>
        <div className="flex flex-wrap gap-1" role="group" aria-label="Режим отображения">
          {scheduleViewOptions.map(({ key, label }) => {
            const active =
              key === 'list' ? renderMode === 'list' : renderMode === 'calendar' && view === key;
            return (
              <Button
                key={key}
                type="button"
                size="sm"
                variant={active ? 'default' : 'outline'}
                className={active ? undefined : INACTIVE_TOOLBAR_BUTTON_CLASS}
                onClick={() => {
                  setFiltersPanelOpen(false);
                  if (view === 'day') {
                    setDrillBackView(null);
                    onDeepLinkChange('from', null);
                  }
                  if (key === 'list') {
                    setRenderMode('list');
                    return;
                  }
                  setRenderMode('calendar');
                  setView(key);
                }}
                data-testid={key === 'list' ? 'render-btn-list' : `view-btn-${key}`}
              >
                {label}
              </Button>
            );
          })}
        </div>
        {/* Drill-down «День»: показываем если сейчас day (клик по дню в месяце) */}
        {view === 'day' ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={INACTIVE_TOOLBAR_BUTTON_CLASS}
            onClick={() => {
              setFiltersPanelOpen(false);
              drillBack();
            }}
            data-testid="drill-back-btn"
          >
            ← Назад
          </Button>
        ) : null}
      </section>

      <section className={doctorSectionCardClass}>
        <h2 className={cn(doctorSectionTitleClass, 'xl:hidden')}>Период</h2>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={INACTIVE_TOOLBAR_BUTTON_CLASS}
            onClick={() => {
              setFiltersPanelOpen(false);
              goToday();
            }}
            data-testid="period-today"
          >
            Сегодня
          </Button>
          <DoctorSchedulePeriodNav
            label={periodNavLabelText}
            labelRef={registerPeriodLabelNode(slotKey)}
            onPrev={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(-1);
            }}
            onNext={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(1);
            }}
            onLabelClick={() => {
              setFiltersPanelOpen(false);
              // Тот же приём, что и на мобильном label-click: перед открытием общей модалки
              // выбора даты подтягиваем `mobileVisibleDate` к текущему `anchorDate` — иначе
              // DayPicker (использует `mobileVisibleDate`, не обновляемый стрелками вне
              // мобильного вьюпорта) откроется на устаревшем месяце.
              updateMobileVisibleDate(anchorDate, true);
              setDatePickerOpen(true);
            }}
            prevAriaLabel="Предыдущий период"
            nextAriaLabel="Следующий период"
            labelAriaLabel="Перейти к дате"
            prevTestId="period-prev"
            nextTestId="period-next"
            labelTestId="period-label"
          />
        </div>
      </section>
    </>
  );

  /**
   * Поиск по записям. Владелец 15.09: «поиск перенести под блок с выбором филиала/услуги/отмен —
   * и в десктопе/планшете и в мобиле», поэтому блок отделён от `renderScheduleTopBlocks` и
   * вызывается ПОСЛЕ `renderScheduleFilters`. С мобильного верхнего тулбара строка поиска убрана
   * тем же решением — на телефоне она теперь живёт здесь же, в модалке фильтров.
   */
  const renderScheduleSearchBlock = () => (
    <section className={doctorSectionCardClass}>
      <h2 className={cn(doctorSectionTitleClass, 'xl:hidden')}>Поиск по записям</h2>
      <div className="relative">
        <Search
          className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          type="search"
          placeholder="Поиск записей…"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          className="h-8 pl-8 text-sm"
          aria-label="Поиск записей"
        />
      </div>
      {renderMode === 'list' && searchQuery.trim() ? (
        <div className="flex flex-col gap-1 text-xs text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <DoctorResultCount
              data-testid="search-count"
              label="Найдено"
              value={serverSearchTotal ?? visibleListAppointments.length}
            />
            {/*
              Владелец 15.09: «в режиме списка, поскольку мы подгружаем так же историю, писать не
              только сколько найдено но и с какого периода». У ленты нет конца периода — есть
              граница, докуда её дотянули, поэтому вместо диапазона пишем одну дату: самую раннюю
              из найденного.
            */}
            {searchResultsFromLabel ? (
              <span data-testid="search-from">с {searchResultsFromLabel}</span>
            ) : null}
          </div>
          {searchQuery.trim().length >= 3 && !serverSearchQuery ? (
            <button
              type="button"
              className="self-start text-primary underline-offset-2 hover:underline"
              onClick={() => void searchAllAppointments()}
              disabled={serverSearchLoading}
            >
              {serverSearchLoading ? 'Поиск…' : 'Искать более ранние'}
            </button>
          ) : null}
        </div>
      ) : null}
    </section>
  );

  const kpiFilterPredicate = useMemo<
    ((appointment: CalendarAppointmentEvent) => boolean) | null
  >(() => {
    if (activeKpiFilters.length === 0) return null;
    const firstVisitIdSet = new Set<string>(kpis?.firstVisitIds ?? []);
    const predicates: Record<
      ScheduleKpiFilterKey,
      (appointment: CalendarAppointmentEvent) => boolean
    > = {
      cancellationsInPeriod: (appointment) => isCancelledAppointmentStatus(appointment.status),
      firstVisitInPeriod: (appointment) => firstVisitIdSet.has(appointment.id),
      bySubscriptionInPeriod: (appointment) =>
        Boolean(appointment.packageUsageRef || appointment.packageTitle),
      futureInPeriod: (appointment) =>
        parseFeedInstant(appointment.startAt, currentTimeZone) >= DateTime.now(),
      reschedulesInPeriod: (appointment) =>
        !isCancelledAppointmentStatus(appointment.status) && appointment.rescheduleCount > 0,
    };
    return (appointment) => activeKpiFilters.every((key) => predicates[key](appointment));
  }, [activeKpiFilters, currentTimeZone, kpis?.firstVisitIds]);

  const displayableCalendarEvents = useMemo(
    () =>
      (data?.events ?? []).filter(
        (event) =>
          event.kind !== 'appointment' ||
          (includeCancelledAppointments || !isCancelledAppointmentStatus(event.status)) &&
            (!kpiFilterPredicate || kpiFilterPredicate(event)),
      ),
    [data?.events, includeCancelledAppointments, kpiFilterPredicate],
  );

  /**
   * Поиск сужает КАЛЕНДАРНУЮ СЕТКУ, а не только ленту списка. Владелец 15.09: «в режиме календаря
   * поиск сейчас не работает и записи в видимом окне не фильтрует (ни в 3 дня/неделе, ни в месяце)»
   * — до этой правки такой мемо в файле был, но его никто не использовал: сетку кормит
   * `calendarEvents`, собранный напрямую из `displayableCalendarEvents`, поэтому строка поиска
   * молча ни на что не влияла.
   *
   * Прячем ТОЛЬКО записи, не подходящие под поиск (решение владельца 15.09). Рабочие часы,
   * перерывы, свободные слоты и блокировки остаются на месте: они разметка дня, а не результат
   * поиска, и без них сетка схлопнулась бы в пустое поле.
   */
  const searchedCalendarEvents = useMemo<CalendarEvent[]>(() => {
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    if (!query) return displayableCalendarEvents;
    return displayableCalendarEvents.filter((event) => {
      if (event.kind !== 'appointment') return true;
      return [event.patientName, event.patientPhone, event.serviceTitle, event.branchTitle].some(
        (value) => value?.toLocaleLowerCase('ru').includes(query),
      );
    });
  }, [displayableCalendarEvents, searchQuery]);

  const workingBounds = data?.workingBounds;
  const calendarScrollTime = deriveCalendarInitialScrollTime(
    workingBounds,
    displayableCalendarEvents,
    currentTimeZone,
  );
  // The full day stays reachable inside the calendar scroll area. On mount the
  // viewport starts at actual working hours (or an earlier appointment), not midnight.
  const slotMinTime = '00:00:00';
  const slotMaxTime = '24:00:00';
  const loMinute = 0;
  const hiMinute = 24 * 60;

  const findWorkingBranchIdForStart = useCallback(
    (startLocal: string): string | null => {
      const start = DateTime.fromISO(startLocal, { zone: currentTimeZone });
      if (!start.isValid) return null;
      const startMs = start.toMillis();
      const event = (data?.events ?? []).find((e) => {
        if (e.kind !== 'working' || !e.branchId) return false;
        const from = parseFeedInstant(e.startAt, currentTimeZone).toMillis();
        const to = parseFeedInstant(e.endAt, currentTimeZone).toMillis();
        return from <= startMs && startMs < to;
      });
      return event?.kind === 'working' ? event.branchId : null;
    },
    [data?.events, currentTimeZone],
  );

  const chooseServiceForDuration = useCallback(
    (durationMinutes: number | null): string | null => {
      if (durationMinutes != null) {
        const exact = filters.services.find(
          (service) => service.durationMinutes === durationMinutes,
        );
        if (exact) return exact.id;
      }
      if (calendarSettings.defaultServiceId) {
        const configured = filters.services.find(
          (service) => service.id === calendarSettings.defaultServiceId,
        );
        if (configured) return configured.id;
      }
      return resolveCalendarCreateFieldValue(filters.services, serviceId, null);
    },
    [filters.services, calendarSettings.defaultServiceId, serviceId],
  );

  const clearDraftAndPanel = useCallback(() => {
    if (createPanelRevealTimerRef.current !== null) {
      window.clearTimeout(createPanelRevealTimerRef.current);
      createPanelRevealTimerRef.current = null;
    }
    setSelected(null);
    setShowCreatePanel(false);
    setCreateInitialStart(null);
    setCreateInitialEnd(null);
    setCreateInitialBranchId(null);
    setCreateInitialServiceId(null);
    setDraftSlot(null);
    setCreateFormDirty(false);
    setGridSelection(null);
    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    onDeepLinkChange('appt', null);
    calendarRef.current?.getApi().unselect();
  }, [onDeepLinkChange]);

  const openCreateDraft = useCallback(
    (start: Date, end: Date | null, revealWithDelay = false) => {
      if (!canManageAppointments) return;
      const startLocal =
        DateTime.fromJSDate(start).setZone(currentTimeZone).toFormat("yyyy-MM-dd'T'HH:mm") || null;
      if (!startLocal) return;
      const durationFromDrag = end
        ? Math.max(1, Math.round((end.getTime() - start.getTime()) / 60_000))
        : null;
      const serviceForDraft = chooseServiceForDuration(durationFromDrag);
      const serviceDuration =
        serviceForDraft != null
          ? (filters.services.find((service) => service.id === serviceForDraft)?.durationMinutes ??
            null)
          : null;
      const durationMinutes = durationFromDrag ?? serviceDuration ?? 60;
      const endDate = end ?? new Date(start.getTime() + durationMinutes * 60_000);
      const endLocal =
        DateTime.fromJSDate(endDate).setZone(currentTimeZone).toFormat("yyyy-MM-dd'T'HH:mm") ||
        null;
      if (!endLocal) return;
      const workingBranchId = findWorkingBranchIdForStart(startLocal);
      const branchForDraft =
        workingBranchId ??
        (calendarSettings.defaultBranchId &&
        filters.branches.some((b) => b.id === calendarSettings.defaultBranchId)
          ? calendarSettings.defaultBranchId
          : resolveCalendarCreateFieldValue(filters.branches, branchId, null));
      setSelected(null);
      setCreateInitialStart(startLocal);
      setCreateInitialEnd(endLocal);
      setCreateInitialBranchId(branchForDraft);
      setCreateInitialServiceId(serviceForDraft);
      setDraftSlot({
        start: DateTime.fromJSDate(start).toISO() ?? start.toISOString(),
        end: DateTime.fromJSDate(endDate).toISO() ?? endDate.toISOString(),
      });
      setCreateFormDirty(false);
      if (createPanelRevealTimerRef.current !== null) {
        window.clearTimeout(createPanelRevealTimerRef.current);
      }
      const revealPanel = () => {
        createPanelRevealTimerRef.current = null;
        setShowCreatePanel(true);
        onDeepLinkChange('appt', null);
      };
      if (revealWithDelay) {
        createPanelRevealTimerRef.current = window.setTimeout(
          revealPanel,
          CREATE_PANEL_REVEAL_DELAY_MS,
        );
      } else {
        revealPanel();
      }
    },
    [
      currentTimeZone,
      chooseServiceForDuration,
      filters.services,
      filters.branches,
      findWorkingBranchIdForStart,
      calendarSettings.defaultBranchId,
      branchId,
      onDeepLinkChange,
      canManageAppointments,
    ],
  );

  // ─── Grid time selection + contextual menu (CAL-ACTION-01…10) ─────────────

  /**
   * A tap, long-press or drag on the empty grid first persists a visible time selection and
   * opens the shared doctor contextual menu next to it. The appointment form is only reached
   * from «Новая запись» inside that menu.
   */
  const clearGridSelection = useCallback(() => {
    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    setGridSelection(null);
    calendarRef.current?.getApi().unselect();
  }, []);

  const openGridSelection = useCallback(
    (start: Date, end: Date | null) => {
      if (!canManageAppointments) return;
      const startDt = DateTime.fromJSDate(start).setZone(currentTimeZone);
      const dateKey = startDt.toISODate();
      if (!dateKey) return;
      const serviceForDraft = chooseServiceForDuration(null);
      const serviceDuration =
        serviceForDraft != null
          ? (filters.services.find((service) => service.id === serviceForDraft)?.durationMinutes ??
            null)
          : null;
      const endDate = end ?? new Date(start.getTime() + (serviceDuration ?? 60) * 60_000);
      const endDt = DateTime.fromJSDate(endDate).setZone(currentTimeZone);
      const dayStart = startDt.startOf('day');
      setSelectionActionError(null);
      setGridSelection({
        dateKey,
        startMinute: Math.round(startDt.diff(dayStart, 'minutes').minutes),
        endMinute: Math.round(endDt.diff(dayStart, 'minutes').minutes),
        startAt: start,
        endAt: endDate,
      });
      if (!end) {
        // A single tap has no FullCalendar highlight of its own — create the same visible
        // selection a drag would leave behind. FullCalendar emits `select` synchronously,
        // so the re-entry guard is released immediately after the call.
        suppressSelectCallbackRef.current = true;
        calendarRef.current?.getApi().select(start, endDate);
        suppressSelectCallbackRef.current = false;
      }
      setSelectionMenuOpen(true);
    },
    [canManageAppointments, chooseServiceForDuration, currentTimeZone, filters.services],
  );

  /**
   * The selection read against the schedule layers of its day: which of them it covers, the
   * effective working bounds it would be written into, and what must not be closed.
   */
  const selectionContext = useMemo(() => {
    if (!gridSelection) return null;
    const working: MinuteInterval[] = [];
    const breaks: MinuteInterval[] = [];
    const busy: MinuteInterval[] = [];
    const branchIds = new Set<string>();
    for (const event of displayableCalendarEvents) {
      const interval = eventDayInterval(
        event.startAt,
        event.endAt,
        currentTimeZone,
        gridSelection.dateKey,
      );
      if (!interval) continue;
      if (event.kind === 'working') {
        working.push(interval);
        if (event.branchId) branchIds.add(event.branchId);
        continue;
      }
      if (event.kind === 'break') {
        breaks.push(interval);
        continue;
      }
      if (event.kind === 'appointment' && !isCancelledAppointmentStatus(event.status)) {
        busy.push(interval);
      }
    }
    const selection: MinuteInterval = {
      startMinute: gridSelection.startMinute,
      endMinute: gridSelection.endMinute,
    };
    const touchesWorking = intersectsAny(selection, working);
    const touchesBreak = intersectsAny(selection, breaks);
    const kind: CalendarSelectionKind =
      touchesWorking && touchesBreak
        ? 'mixed'
        : touchesWorking
          ? 'working'
          : touchesBreak
            ? 'break'
            : 'outside';
    return {
      kind,
      working,
      breaks,
      busy,
      branchIds: [...branchIds],
      dayStartMinute: working.length > 0 ? Math.min(...working.map((i) => i.startMinute)) : 0,
      dayEndMinute: working.length > 0 ? Math.max(...working.map((i) => i.endMinute)) : 0,
    };
  }, [currentTimeZone, displayableCalendarEvents, gridSelection]);

  const canEditSelectionSchedule =
    canManageAvailability &&
    scopeBootstrap.ownSpecialistId !== null &&
    (scheduleScope.scope === 'mine' ||
      (scheduleScope.scope === 'specialist' &&
        scheduleScope.specialistId === scopeBootstrap.ownSpecialistId));
  const canOpenWorkingHours = filters.branches.length > 0 && canEditSelectionSchedule;

  const selectionMenuActions = useMemo((): CalendarSelectionAction[] => {
    if (!canManageAppointments) return [];
    if (!selectionContext) return [];
    const canEditSchedule = canEditSelectionSchedule;
    if (selectionContext.kind === 'working') {
      return canEditSchedule ? ['create', 'add-break'] : ['create'];
    }
    if (selectionContext.kind === 'mixed') {
      return canEditSchedule ? ['add-break', 'open-for-booking', 'create'] : ['create'];
    }
    // CAL-ACTION-04: break, closed slot and outside-working-hours selections all read as
    // `'break'`/`'outside'` here — none of them is currently bookable, so both offer the same
    // "reopen" action; `applySelectionScheduleChange` picks the right mutation per kind.
    if (selectionContext.kind === 'break' || selectionContext.kind === 'outside') {
      return canEditSchedule || (selectionContext.kind === 'outside' && canOpenWorkingHours)
        ? ['open-for-booking', 'create']
        : ['create'];
    }
    return ['create'];
  }, [canManageAppointments, canEditSelectionSchedule, canOpenWorkingHours, selectionContext]);

  /**
   * Anchors the contextual menu to the live FullCalendar highlight so it tracks the selection
   * while the grid scrolls, and keeps the last known rect when a refetch repaints the grid.
   */
  const selectionAnchor = useMemo(
    () => ({
      getBoundingClientRect: () => {
        const host = calendarViewportRef.current;
        const highlights = host
          ? Array.from(host.querySelectorAll<HTMLElement>('.fc-highlight'))
          : [];
        if (highlights.length > 0) {
          const rects = highlights.map((element) => element.getBoundingClientRect());
          const top = Math.min(...rects.map((rect) => rect.top));
          const bottom = Math.max(...rects.map((rect) => rect.bottom));
          const left = Math.min(...rects.map((rect) => rect.left));
          const right = Math.max(...rects.map((rect) => rect.right));
          const merged = {
            x: left,
            y: top,
            top,
            left,
            right,
            bottom,
            width: right - left,
            height: bottom - top,
          };
          selectionAnchorRectRef.current = merged;
          return merged;
        }
        return (
          selectionAnchorRectRef.current ?? {
            x: 0,
            y: 0,
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            width: 0,
            height: 0,
          }
        );
      },
    }),
    [],
  );

  /**
   * CAL-ACTION-06/07/10: both schedule actions persist through the canonical per-date
   * `working-days` contract — one upsert of the effective day with the recomputed break list.
   */
  const applySelectionScheduleChange = useCallback(
    async (mode: 'add-break' | 'open-for-booking', target?: { branchId: string }) => {
      if (!gridSelection || !selectionContext) return;
      if (!canManageAvailability || !canEditSelectionSchedule) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.foreign_specialist ?? null);
        return;
      }
      if (selectionContext.branchIds.length > 1) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.multiple_branches ?? null);
        return;
      }
      const editInput = {
        dayStartMinute: selectionContext.dayStartMinute,
        dayEndMinute: selectionContext.dayEndMinute,
        breaks: selectionContext.breaks,
        selection: {
          startMinute: gridSelection.startMinute,
          endMinute: gridSelection.endMinute,
        },
        busy: selectionContext.busy,
      };
      // CAL-ACTION-04/07: a break/mixed selection reopens by trimming the existing break; an
      // outside-working-hours (or closed-slot) selection has no break to trim, so it widens the
      // working day itself onto the selected side instead — same `PUT /working-days` write below.
      const result =
        mode === 'add-break'
          ? addBreakToWorkingDay(editInput)
          : selectionContext.kind === 'outside'
            ? openWorkingHoursForSelection(editInput)
            : openWorkingDayIntervalForBooking(editInput);
      if (!result.ok) {
        setSelectionActionError(
          SELECTION_MUTATION_ERRORS[result.error] ?? 'Не удалось обновить график.',
        );
        return;
      }
      if (result.breaks.length > MAX_WORKING_DAY_BREAKS) {
        setSelectionActionError(SELECTION_MUTATION_ERRORS.too_many_breaks ?? null);
        return;
      }
      const nextDayStartMinute =
        'dayStartMinute' in result ? result.dayStartMinute : selectionContext.dayStartMinute;
      const nextDayEndMinute =
        'dayEndMinute' in result ? result.dayEndMinute : selectionContext.dayEndMinute;
      setSelectionActionPending(true);
      setSelectionActionError(null);
      try {
        const res = await fetch(`${API_BASE}/working-days`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            action: 'upsert',
            dates: [gridSelection.dateKey],
            startMinute: nextDayStartMinute,
            endMinute: nextDayEndMinute,
            breaks: result.breaks,
            branchId: target?.branchId ?? selectionContext.branchIds[0],
          }),
        });
        const json: unknown = await res.json().catch(() => null);
        const ok = res.ok && typeof json === 'object' && json !== null && 'ok' in json && json.ok;
        if (!ok) {
          setSelectionActionError('Не удалось обновить график.');
          return;
        }
        setOpenWorkingHoursDialog(null);
        clearGridSelection();
        // The schedule changed under the visible range — bypass the duplicate-load window.
        recentLoadRef.current = null;
        load();
      } catch {
        setSelectionActionError('Не удалось обновить график.');
      } finally {
        setSelectionActionPending(false);
      }
    },
    [
      canEditSelectionSchedule,
      canManageAvailability,
      clearGridSelection,
      gridSelection,
      load,
      selectionContext,
    ],
  );

  const beginOpenWorkingHours = useCallback(() => {
    if (!gridSelection || !selectionContext) return;
    if (selectionContext.kind !== 'outside') {
      void applySelectionScheduleChange('open-for-booking');
      return;
    }
    const branchOptions = filters.branches;
    const activeBranchId =
      branchId && branchOptions.some((branch) => branch.id === branchId) ? branchId : null;
    const defaultBranchId =
      activeBranchId ??
      (calendarSettings.defaultBranchId &&
      branchOptions.some((branch) => branch.id === calendarSettings.defaultBranchId)
        ? calendarSettings.defaultBranchId
        : branchOptions.length === 1
          ? (branchOptions[0]?.id ?? null)
          : null);

    if ((activeBranchId || branchOptions.length === 1) && defaultBranchId) {
      void applySelectionScheduleChange('open-for-booking', {
        branchId: defaultBranchId,
      });
      return;
    }

    setSelectionMenuOpen(false);
    setSelectionActionError(null);
    setOpenWorkingHoursDialog({
      branchId: defaultBranchId,
    });
  }, [
    applySelectionScheduleChange,
    branchId,
    calendarSettings.defaultBranchId,
    filters.branches,
    gridSelection,
    selectionContext,
  ]);

  const runSelectionAction = useCallback(
    (action: CalendarSelectionAction) => {
      if (action === 'create') {
        const selection = gridSelection;
        setSelectionMenuOpen(false);
        setGridSelection(null);
        setSelectionActionError(null);
        if (selection) openCreateDraft(selection.startAt, selection.endAt);
        return;
      }
      if (action === 'open-for-booking') {
        beginOpenWorkingHours();
        return;
      }
      void applySelectionScheduleChange(action);
    },
    [applySelectionScheduleChange, beginOpenWorkingHours, gridSelection, openCreateDraft],
  );

  useEffect(() => {
    if (
      !createAppointmentRequestId ||
      createAppointmentRequestId <= handledCreateAppointmentRequestRef.current
    ) {
      return;
    }
    handledCreateAppointmentRequestRef.current = createAppointmentRequestId;
    const now = DateTime.now().setZone(currentTimeZone);
    const start =
      now.minute < 30
        ? now.set({ minute: 30, second: 0, millisecond: 0 })
        : now.plus({ hours: 1 }).startOf('hour');
    openCreateDraft(start.toJSDate(), null);
  }, [createAppointmentRequestId, currentTimeZone, openCreateDraft]);

  useEffect(
    () => () => {
      if (createPanelRevealTimerRef.current !== null) {
        window.clearTimeout(createPanelRevealTimerRef.current);
      }
    },
    [],
  );

  // ─── FullCalendar view mapping ─────────────────────────────────────────────
  // Объявлено до `calendarEvents`: оформление записи (PAY-APPT-14) выводится из типа FC-вида, а
  // не из отдельной копии условия «это месяц».
  const fcView =
    view === 'day'
      ? 'timeGridDay'
      : view === 'weekgrid'
        ? 'timeGridWeek'
        : view === 'month'
          ? 'dayGridMonth'
          : 'timeGridDay'; // 3days handled as custom range — use timeGridDay with visibleRange

  const calendarEvents = useMemo<EventInput[]>(() => {
    if (!data) return [];
    const isTimeGrid = view !== 'month';
    // §3.14: paint the whole non-working span (pre-shift + post-shift + breaks)
    // gray; working time stays white. Only in hour-grid views (3 дня / Неделя /
    // День) — a month grid has no time axis to fill. Replaces the old per-break
    // background events; the complement fill subsumes them.
    // #6: compute all visible day keys so days with no schedule get full-grey fill.
    const visibleDayKeysForFill: string[] = (() => {
      if (!isTimeGrid) return [];
      const from = DateTime.fromISO(calendarFeedRange.from, { zone: currentTimeZone });
      const to = DateTime.fromISO(calendarFeedRange.to, { zone: currentTimeZone });
      const totalDays = Math.max(1, Math.ceil(to.diff(from, 'days').days));
      const keys: string[] = [];
      for (let i = 0; i < totalDays; i++) {
        const k = from.plus({ days: i }).toISODate();
        if (k) keys.push(k);
      }
      return keys;
    })();

    // Всегда генерируем серый фон для timeGrid, даже если workingBounds=null
    // или прежняя display-настройка выключена: рабочие границы — часть самой сетки,
    // а не опциональный декоративный слой. Если рабочих часов нет, день целиком нерабочий.
    // Временная ось теперь полная (00:00–24:00), поэтому фон покрывает весь день.
    const grayFill = isTimeGrid
      ? buildDoctorCalendarNonWorkingRanges(
          displayableCalendarEvents.filter((e) => e.kind === 'working'),
          currentTimeZone,
          visibleDayKeysForFill,
          loMinute,
          hiMinute,
        ).map((f) => ({
          id: f.id,
          start: f.start,
          end: f.end,
          display: 'background' as const,
          classNames: [...doctorCalendarNonWorkingClassNames],
          editable: false,
          extendedProps: { kind: 'nonworking' as const },
        }))
      : [];
    const mapped = searchedCalendarEvents
      .map((event) => {
        // Рабочее время — не рендерим (фон белый).
        if (event.kind === 'working') return null;

        // CAL-ACTION-09: перерыв визуально совпадает с нерабочим временем до и после смены —
        // тот же лёгкий фон и без подписи внутри сетки.
        if (event.kind === 'break' && isTimeGrid) {
          return {
            id: `break:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            display: 'background' as const,
            classNames: [...doctorCalendarNonWorkingClassNames],
            editable: false,
            extendedProps: { kind: 'break' as const },
          };
        }
        if (event.kind === 'break') return null;

        if (event.kind === 'block') {
          return {
            id: `block:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            title: eventTitle(event),
            editable: false,
            classNames: [eventClassName(event)],
            extendedProps: { kind: event.kind, block: event },
          };
        }
        if (event.kind === 'freeSlot') {
          return {
            id: `free:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            title: eventTitle(event),
            editable: false,
            classNames: [eventClassName(event)],
            extendedProps: { kind: event.kind },
          };
        }
        return {
          id: event.id,
          start: toFcDate(event.startAt, currentTimeZone),
          end: toFcDate(event.endAt, currentTimeZone),
          title: eventTitle(event),
          // PAY-APPT-14: в dayGrid событие со временем по умолчанию сжимается до «точки» без
          // рамки и поверхности — общий payment-pending border и цвет филиала тогда пропадают
          // молча. Режим отрисовки выводит общая функция из типа вида, а не локальное условие.
          display: doctorCalendarAppointmentDisplay(fcView),
          editable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          durationEditable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          startEditable: canManageAppointments && !isCancelledAppointmentStatus(event.status),
          classNames: [eventClassName(event)],
          ...doctorCalendarAppointmentBranchColors(event),
          extendedProps: {
            kind: event.kind,
            appointment: event,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    const draft = draftSlot
      ? [
          {
            id: 'draft:create',
            start: draftSlot.start,
            end: draftSlot.end,
            title: 'Новая запись',
            editable: false,
            classNames: ['!bg-sky-500/20 text-sky-950 !border-sky-500/50 border-dashed'],
            extendedProps: { kind: 'draft' as const },
          },
        ]
      : [];
    return [...grayFill, ...mapped, ...draft];
  }, [
    data,
    displayableCalendarEvents,
    searchedCalendarEvents,
    view,
    fcView,
    calendarFeedRange,
    currentTimeZone,
    loMinute,
    hiMinute,
    draftSlot,
    canManageAppointments,
  ]);

  // ─── Reschedule (drag/resize) ──────────────────────────────────────────────

  const performReschedule = useCallback(
    async (
      appointment: CalendarAppointmentEvent,
      startAt: string,
      endAt: string,
      staffComment?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
      if (!canManageAppointments) return { ok: false, error: 'forbidden' };
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
      );
      const res = await fetch(
        `${API_BASE}/appointments/${encodeURIComponent(appointment.id)}/manual-reschedule`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            newStartAt: startAt,
            newEndAt: endAt,
            durationMinutes,
            ...(staffComment && staffComment.trim() ? { staffComment: staffComment.trim() } : {}),
          }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        return { ok: false, error: json.error ?? `load_failed_${res.status}` };
      }
      return { ok: true };
    },
    [canManageAppointments],
  );

  // R34: drag/resize не применяются сразу — открываем диалог подтверждения.
  const openRescheduleConfirm = useCallback(
    (arg: any) => {
      if (!canManageAppointments) return arg.revert();
      const appointment = arg.event.extendedProps?.appointment as
        CalendarAppointmentEvent | undefined;
      if (!appointment) return arg.revert();
      const nextStart = arg.event.start?.toISOString();
      const nextEnd = arg.event.end?.toISOString();
      if (!nextStart || !nextEnd) return arg.revert();
      pendingRescheduleRef.current = { appointment, arg, newStartAt: nextStart, newEndAt: nextEnd };
      setRescheduleComment('');
      setRescheduleError(null);
      setRescheduleBusy(false);
      setPendingReschedule({
        patientName: appointment.patientName ?? null,
        oldStartAt: appointment.startAt,
        oldEndAt: appointment.endAt,
        newStartAt: nextStart,
        newEndAt: nextEnd,
      });
    },
    [canManageAppointments],
  );

  const cancelRescheduleConfirm = useCallback(() => {
    pendingRescheduleRef.current?.arg.revert();
    pendingRescheduleRef.current = null;
    setPendingReschedule(null);
    setRescheduleError(null);
    setRescheduleBusy(false);
  }, []);

  const confirmRescheduleConfirm = useCallback(async () => {
    const ctx = pendingRescheduleRef.current;
    if (!ctx) return;
    setRescheduleBusy(true);
    setRescheduleError(null);
    const result = await performReschedule(
      ctx.appointment,
      ctx.newStartAt,
      ctx.newEndAt,
      rescheduleComment,
    );
    if (result.ok) {
      pendingRescheduleRef.current = null;
      setPendingReschedule(null);
      setRescheduleBusy(false);
      // Перерисовать календарь из источника (применённое время уже на сетке).
      load();
      return;
    }
    // Ошибка — показываем в диалоге, запись пока остаётся на новом месте до решения врача.
    setRescheduleBusy(false);
    setRescheduleError(rescheduleErrorLabel(result.error));
  }, [performReschedule, rescheduleComment, load]);

  const onDrop = useCallback((arg: any) => openRescheduleConfirm(arg), [openRescheduleConfirm]);
  const onResize = useCallback((arg: any) => openRescheduleConfirm(arg), [openRescheduleConfirm]);

  // CAL-ACTION-01: a drag over the grid keeps its visible selection and opens the menu.
  const onSelect = useCallback(
    (arg: { start?: Date | null; end?: Date | null }) => {
      if (suppressSelectCallbackRef.current) {
        suppressSelectCallbackRef.current = false;
        return;
      }
      if (filtersPanelOpen) {
        setFiltersPanelOpen(false);
        calendarRef.current?.getApi().unselect();
        return;
      }
      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
        suppressCalendarInteractionUntilRef.current = 0;
        calendarRef.current?.getApi().unselect();
        return;
      }
      const start: Date | null = arg.start ?? null;
      const end: Date | null = arg.end ?? null;
      if (!start) return;
      lastSelectAtRef.current = Date.now();
      openGridSelection(start, end ?? null);
    },
    [filtersPanelOpen, openGridSelection],
  );

  const closeDraftOrSelectionFromGrid = useCallback((): boolean => {
    if (createFormDirty && showCreatePanel) {
      const ok = window.confirm('Событие не сохранено, вы уверены что хотите сбросить изменения?');
      if (!ok) return false;
    }
    clearDraftAndPanel();
    return true;
  }, [clearDraftAndPanel, createFormDirty, showCreatePanel]);

  const openAppointmentDetails = useCallback(
    (appointment: CalendarAppointmentEvent) => {
      setFiltersPanelOpen(false);
      if (showCreatePanel && createFormDirty) {
        const ok = window.confirm(
          'Событие не сохранено, вы уверены что хотите сбросить изменения?',
        );
        if (!ok) return;
      }
      setSelected(appointment);
      setShowCreatePanel(false);
      setCreateInitialStart(null);
      setCreateInitialEnd(null);
      setCreateInitialBranchId(null);
      setCreateInitialServiceId(null);
      setDraftSlot(null);
      setCreateFormDirty(false);
      onDeepLinkChange('appt', appointment.id);
    },
    [createFormDirty, onDeepLinkChange, showCreatePanel],
  );

  // For 3days, use timeGrid with 3 days duration
  const fcInitialView = useMemo(() => {
    if (view === '3days') return 'timeGrid3days';
    return fcView;
  }, [fcView, view]);

  const fcViews = useMemo((): NonNullable<FullCalendarOptions['views']> => {
    if (view === '3days') {
      return {
        timeGrid3days: {
          type: 'timeGrid',
          duration: { days: 3 },
          buttonText: '3 дня',
        },
      };
    }
    if (view === 'month') {
      return {
        dayGridMonth: {
          dayCellClassNames: () => [],
        },
      };
    }
    return {};
  }, [view]);

  // ─── Render ────────────────────────────────────────────────────────────────

  useEffect(() => {
    if (serverSearchQuery !== null && serverSearchQuery !== searchQuery.trim()) {
      setServerSearchQuery(null);
      setServerSearchTotal(null);
      setServerSearchHasMore(false);
    }
  }, [searchQuery, serverSearchQuery]);

  const visibleListAppointments = useMemo(() => {
    const source = serverSearchQuery ? serverSearchItems : listAppointments;
    const query = searchQuery.trim().toLocaleLowerCase('ru');
    return source.filter((appointment) => {
      if (!includeCancelledAppointments && isCancelledAppointmentStatus(appointment.status)) {
        return false;
      }
      if (kpiFilterPredicate && !kpiFilterPredicate(appointment)) return false;
      if (serverSearchQuery || !query) return true;
      return [
        appointment.patientName,
        appointment.patientPhone,
        appointment.serviceTitle,
        appointment.branchTitle,
      ].some((value) => value?.toLocaleLowerCase('ru').includes(query));
    });
  }, [
    listAppointments,
    searchQuery,
    serverSearchItems,
    serverSearchQuery,
    includeCancelledAppointments,
    kpiFilterPredicate,
  ]);
  /**
   * «С какого периода» для счётчика найденного в ленте (владелец 15.09, п.8): самая ранняя из
   * найденных записей. Ленты и результаты серверного поиска отсортированы по возрастанию
   * (`mergeAppointmentPages`, `order: 'asc'`), поэтому это первый элемент. После «искать более
   * ранние» дата сама сдвигается назад вместе с новыми результатами.
   */
  const searchResultsFromLabel = useMemo(() => {
    if (renderMode !== 'list' || !searchQuery.trim()) return null;
    const earliest = visibleListAppointments[0];
    if (!earliest) return null;
    const day = parseFeedInstant(earliest.startAt, currentTimeZone).setLocale('ru');
    return day.isValid ? day.toFormat('d LLL yyyy') : null;
  }, [currentTimeZone, renderMode, searchQuery, visibleListAppointments]);

  /**
   * Текст кнопки периода. В сетке — границы видимого периода датами (владелец 15.09, п.6: «даты,
   * месяц сокращенно и год» во всех размерах экрана). В ленте — одна дата, та, что сейчас наверху
   * экрана (п.7); пока прокрутка идёт, текст переписывает `handleListVisibleDateChange` напрямую в
   * DOM, а сюда попадает уже устоявшееся значение.
   */
  const periodNavLabelText =
    renderMode === 'list'
      ? listPeriodNavLabel(listVisibleDate ?? listAnchorDate, currentTimeZone)
      : periodNavLabel(view, anchorDate, currentTimeZone);

  const branchShortLabels = useMemo(
    () =>
      new Map(
        filters.branches.map((branch) => [branch.id, branch.shortLabel ?? branch.label] as const),
      ),
    [filters.branches],
  );

  const eventPanelOpen = selected !== null || showCreatePanel;
  const eventPanelTitle = selected ? (
    <DoctorModalStackedTitle
      label={`Запись на ${appointmentAccusative}`}
      patientName={selected.patientName ?? patientSingularLabel}
      patientHref={selected.platformUserId ? patientCardHref(selected.platformUserId) : null}
      patientOnSupport={selected.patientOnSupport === true}
    />
  ) : (
    'Новая запись'
  );
  const eventPanelNode = eventPanelOpen ? (
    <DoctorCalendarEventPanel
      key={selected?.id ?? 'create'}
      apiBase={API_BASE}
      selected={selected}
      timeZone={currentTimeZone}
      filterMeta={filters}
      activeFilters={activeFilters}
      ownSpecialistId={scopeBootstrap.ownSpecialistId}
      clinicSpecialists={scopeBootstrap.specialists}
      appointmentsManageOwn={canManageAppointments}
      flushChrome
      startInCreate={showCreatePanel && !selected}
      createInitialStart={createInitialStart}
      createInitialEnd={createInitialEnd}
      createInitialBranchId={createInitialBranchId}
      createInitialServiceId={createInitialServiceId}
      createInitialSpecialistId={defaultCreateSpecialistId}
      onCreateDirtyChange={setCreateFormDirty}
      onClose={clearDraftAndPanel}
      onChanged={() => {
        clearDraftAndPanel();
        load();
      }}
      onUpdated={(updated) => {
        if (updated) setSelected(updated);
        recentLoadRef.current = null;
        load();
        if (renderMode === 'list') void loadInitialAppointmentFeed();
      }}
    />
  ) : null;
  const handleKpiClick = (key: ScheduleKpiFilterKey | 'recordsInPeriod') => {
    if (key === 'recordsInPeriod') {
      setSelectedKpiFilters(NO_KPI_FILTERS);
      return;
    }
    setSelectedKpiFilters((current) =>
      current.includes(key) ? current.filter((selected) => selected !== key) : [...current, key],
    );
  };
  const toggleFiltersPanel = () => {
    if (filtersPanelOpen) {
      setFiltersPanelOpen(false);
      return;
    }
    if (eventPanelOpen && !closeDraftOrSelectionFromGrid()) return;
    setFiltersPanelOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      {/* Toolbar (D1) — full width. R30: прилипает 2-м рядом под per-page-шапкой
          (комбинируем базовый sticky-класс с top-офсетом, как эталон exercises). */}
      {/* Владелец 15.09: «в десктопе от прошлого верхнего тулбара осталась маленькая серая
          полоска — убрать». Полоска — сам этот контейнер: `DoctorPageToolbar` рисует рамку снизу
          и вертикальные отступы независимо от содержимого, а на xl+ всё содержимое скрыто (оба
          мобильных ряда — `md:hidden`, планшетный триггер — `xl:hidden`), поэтому оставалась
          пустая полоса с рамкой. Прячем контейнер целиком там, где ему нечего показывать. */}
      <DoctorCatalogStickyToolbar
        withinRemainingHeight
        className="flex flex-wrap items-center gap-2 xl:hidden"
        data-testid="cal-toolbar"
      >
        <div className="flex w-full min-w-0 items-center gap-1 md:hidden">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={cn(INACTIVE_TOOLBAR_BUTTON_CLASS, 'h-8 px-2 text-xs')}
            onClick={() => {
              setFiltersPanelOpen(false);
              goToday();
            }}
          >
            Сегодня
          </Button>

          <DoctorSchedulePeriodNav
            label={periodNavLabelText}
            labelRef={registerPeriodLabelNode('mobile')}
            onPrev={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(-1);
            }}
            onNext={() => {
              setFiltersPanelOpen(false);
              shiftAnchor(1);
            }}
            onLabelClick={() => {
              setFiltersPanelOpen(false);
              updateMobileVisibleDate(mobileVisibleDateRef.current, true);
              setDatePickerOpen(true);
            }}
            prevAriaLabel="Предыдущий период"
            nextAriaLabel="Следующий период"
            labelAriaLabel="Перейти к дате"
          />

          <div className="ml-auto flex shrink-0 items-center gap-1">
            <Button
              type="button"
              size="icon"
              variant="default"
              className="size-[32px]"
              aria-label={
                renderMode === 'list'
                  ? 'Список. Переключить на три дня'
                  : view === 'month'
                    ? 'Месяц. Переключить на список'
                    : 'Три дня. Переключить на месяц'
              }
              onClick={() => {
                setFiltersPanelOpen(false);
                updateMobileVisibleDate(mobileVisibleDateRef.current, true);
                if (renderMode === 'list') {
                  setRenderMode('calendar');
                  setView('3days');
                  return;
                }
                if (view === 'month') {
                  setRenderMode('list');
                  return;
                }
                if (view === 'day') {
                  setDrillBackView(null);
                  onDeepLinkChange('from', null);
                }
                setView('month');
              }}
            >
              {renderMode === 'list' ? (
                <List className="size-4" aria-hidden />
              ) : view === 'month' ? (
                <CalendarDays className="size-4" aria-hidden />
              ) : (
                <Columns3 className="size-4" aria-hidden />
              )}
            </Button>
            <Button
              type="button"
              size="icon"
              variant={filtersPanelOpen && !hasActiveScheduleFilters ? 'default' : 'outline'}
              className={cn(
                'size-[32px]',
                // Белый фон «спящей» кнопки нельзя класть поверх варианта `default`: у того белый
                // значок, и вместе они дают белое на белом. Пока панель открыта и фильтров нет,
                // кнопку красит сам вариант.
                hasActiveScheduleFilters
                  ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS
                  : !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS,
              )}
              onClick={toggleFiltersPanel}
              aria-label="Фильтры"
              aria-expanded={filtersPanelOpen}
              aria-controls="schedule-filters-panel"
            >
              <span className="relative inline-flex">
                <Filter className="size-4" aria-hidden />
                <DoctorAttentionBadge count={hasActiveScheduleFilters ? 1 : 0} dot />
              </span>
            </Button>
          </div>
        </div>

        {/* Владелец 15.09: «поиск перенести под блок с выбором филиала/услуги/отмен … и в
            десктопе/планшете и в мобиле» — строка поиска ушла из верхнего тулбара телефона в
            модалку фильтров, под блок фильтров (`renderScheduleSearchBlock`). */}

        {/* Владелец 14.09: «в десктопном и планшетном виде надо верхнюю панель перенести в
            правый блок фильтров» — вид/период/поиск переехали в панель фильтров (блоки «Вид»,
            «Период», «Поиск по записям» — см. `renderScheduleTopBlocks` ниже), десктоп (xl+)
            видит их в постоянно открытом `<aside>`, планшет (md..xl) — открыв ту же панель этой
            кнопкой. Сам тулбар в этом диапазоне ширины несёт только триггер открытия панели. */}
        <div className="hidden w-full items-center justify-end gap-2 md:flex xl:hidden">
          <Button
            type="button"
            size="sm"
            variant={filtersPanelOpen && !hasActiveScheduleFilters ? 'default' : 'outline'}
            className={cn(
              'gap-2',
              // То же, что и у значка выше: с открытой панелью и без фильтров цвет даёт вариант
              // `default`, иначе белая надпись легла бы на белый фон.
              hasActiveScheduleFilters
                ? DOCTOR_ACTIVE_FILTER_BUTTON_CLASS
                : !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS,
            )}
            onClick={toggleFiltersPanel}
            aria-expanded={filtersPanelOpen}
            aria-controls="schedule-filters-panel"
          >
            <span className="relative inline-flex">
              <Filter className="size-4" aria-hidden />
              <DoctorAttentionBadge count={hasActiveScheduleFilters ? 1 : 0} dot />
            </span>
            Фильтры
          </Button>
        </div>
      </DoctorCatalogStickyToolbar>

      {/* Error */}
      {error ? (
        <p className="text-sm text-destructive" data-testid="cal-error">
          {error}
        </p>
      ) : null}
      {selectionActionError ? (
        <p className="text-sm text-destructive" data-testid="cal-selection-error">
          {selectionActionError}
        </p>
      ) : null}

      {/* Main content row: calendar/list + aside panel */}
      <div
        className={cn(
          'block min-h-0 flex-1 pb-0 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] xl:items-start xl:gap-4',
          renderMode === 'calendar' && 'flex min-h-0 flex-1 pb-0 xl:items-stretch',
          renderMode === 'list' && 'xl:min-h-0 xl:overflow-hidden xl:pb-0',
        )}
      >
        {/* Content area */}
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1',
            renderMode === 'calendar' && 'h-full md:min-h-0',
            renderMode === 'list' && '-mx-3 h-full min-h-0 md:mx-0',
          )}
        >
          {renderMode === 'list' ? (
            // Continuous list view — grouped by month/day, lazily paged in both directions
            <ListView
              appointments={visibleListAppointments}
              anchorDate={listScrollTargetDate ?? listAnchorDate}
              timeZone={currentTimeZone}
              loading={listLoading}
              loadingEarlier={listLoadingEarlier}
              loadingLater={listLoadingLater || serverSearchLoading}
              hasEarlier={!serverSearchQuery && listHasEarlier}
              hasLater={serverSearchQuery ? serverSearchHasMore : listHasLater}
              onLoadEarlier={() => void loadEarlierAppointments()}
              onLoadLater={() =>
                void (serverSearchQuery ? loadMoreSearchResults() : loadLaterAppointments())
              }
              onSelect={(appt) => {
                setFiltersPanelOpen(false);
                setSelected(appt);
                setShowCreatePanel(false);
                onDeepLinkChange('appt', appt.id);
              }}
              branchShortLabels={branchShortLabels}
              showSpecialist={filters.specialists.length > 1}
              scrollToTodayRequest={listTodayRequest}
              onVisibleDateChange={handleListVisibleDateChange}
              repositionRequest={listRepositionRequest}
            />
          ) : (
            // FullCalendar
            <div className="relative -mx-3 h-full min-h-0 md:mx-0">
              <div
                className={cn(
                  'relative h-full min-h-0 w-full flex-1 touch-pan-y overscroll-contain border-0 bg-card pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-full md:rounded-xl md:border md:border-border',
                  view === 'month' && isMobileViewport
                    ? 'overflow-x-hidden overflow-y-auto'
                    : 'overflow-hidden',
                )}
                ref={calendarViewportRef}
                data-mobile-calendar-viewport=""
                onPointerDownCapture={() => {
                  if (calendarFilterOpenRef.current) {
                    suppressCalendarInteractionUntilRef.current = Date.now() + 1000;
                  }
                }}
              >
                {calendarLoading ? (
                  <DoctorPanelLoading className="absolute inset-0 z-10 bg-background/70" />
                ) : null}
                <div className="h-full min-h-0">
                  <style>{`
                /* §3.7 — статусные Tailwind-цвета приходят important-утилитами из eventClassName
                   (бьют инлайн-синий FC в timeGrid). Здесь убираем тень FC,
                   принудительно делаем текст записей ТЁМНЫМ (FC форсит белый через
                   --fc-event-text-color, его и переопределяем — иначе белое на светлом),
                   и курсор pointer на всех записях (в т.ч. отменённых — клик работает). */

                /* CAL-P1 — kill green flash on first paint.
                   FC default --fc-bg-event-color is #8fdf82 (green, opacity 0.3).
                   All display:"background" events here use Tailwind !bg-[#eeeeee] / !bg-[#d1d5db]
                   which win the cascade, but only after the stylesheet settles. At frame-0 FC
                   paints its default green before the important-utilities kick in. Setting
                   --fc-bg-event-color to transparent on the .fc root means the very first
                   paint is transparent (not green); the Tailwind bg utilities apply in the
                   same frame and set the final colour normally.
                   CR-8: non-working = #eee/0.6, break = #eee/0.6 (both light, owner pref). */
                .fc {
                  --fc-bg-event-color: transparent;
                  --fc-border-color: color-mix(in srgb, var(--border) 62%, transparent);
                }

                /* UI-1a: grid stays legible without competing with appointments. */
                .fc .fc-timegrid-slot {
                  border-color: color-mix(in srgb, var(--border) 52%, transparent) !important;
                }

                /* Drag-selection and click-created draft use the same calendar draft color. */
                .fc .fc-highlight { background-color: rgb(14 165 233 / 20%) !important; }

                .fc-timegrid-event-harness { margin-inline: 1px; }
                /* Pointer only on real (interactive) events. Background events —
                   non-working fill + breaks — are not clickable (dateClick is
                   suppressed over them), so they keep the default cursor instead of
                   the misleading «hand». */
                .fc-event:not(.fc-bg-event) {
                  cursor: pointer !important;
                }
                .fc-event {
                  box-shadow: none !important;
                  --fc-event-text-color: var(--foreground) !important;
                }
                .fc-bg-event {
                  cursor: default !important;
                  pointer-events: none !important;
                }
                .fc-timegrid-bg-harness { pointer-events: none !important; }
                /* Пол по умолчанию для .fc-v-event (у него FC не задаёт цвет текста своим
                   правилом) — БЕЗ !important, чтобы инлайновый textColor от
                   doctorCalendarAppointmentBranchColors() (цвет филиала) побеждал: инлайн-стиль
                   и без !important сильнее любого селекторного правила (аудит 14.09, Э2 FAIL). */
                .fc-event .fc-event-main { color: var(--foreground); }
                /* R10 — прошедшие записи приглушаем, будущие/актуальные ярче */
                .fc-event.fc-event-past { opacity: 0.6; }

                /* §3.9 — мягкая типографика заголовков колонок/дней */
                .fc-col-header-cell {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                }
                .fc-col-header-cell-cushion {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                  text-transform: none !important;
                  color: var(--muted-foreground, currentColor) !important;
                  padding-block: 0.25rem !important;
                }
                .fc .fc-scrollgrid-section-header th {
                  padding-top: 0.125rem;
                  padding-bottom: 0.125rem;
                }

                /* §3.10 — убрать жёлтую заливку «сегодня» в месяце */
                .fc .fc-day-today {
                  --fc-today-bg-color: transparent !important;
                  background-color: transparent !important;
                }

                /* CAL-NAV-08 — сегодняшняя дата помечается канонической скруглённой
                   прямоугольной плашкой (.doctor-calendar-today-marker, doctor.css). */
                .fc-timegrid-header-link {
                  display: flex;
                  min-height: 2.05rem;
                  flex-direction: column;
                  align-items: center;
                  justify-content: center;
                  gap: 0.125rem;
                  padding-block: 0.2rem;
                  text-decoration: none;
                }
                .fc-timegrid-header-link.doctor-calendar-today-marker {
                  gap: 0.1rem;
                  margin-inline: auto;
                  min-height: 2.05rem;
                }
                .fc-timegrid-header-weekday {
                  font-size: 0.6875rem;
                  line-height: 1;
                  color: var(--muted-foreground);
                  text-transform: none;
                }
                .fc-timegrid-header-day {
                  font-size: 0.75rem;
                  line-height: 1;
                  color: var(--foreground);
                }
                .fc-timegrid-header-link.doctor-calendar-today-marker .fc-timegrid-header-weekday,
                .fc-timegrid-header-link.doctor-calendar-today-marker .fc-timegrid-header-day {
                  color: inherit;
                }

                /* §3.11 — мельче цифры дат в месячном виде */
                .fc-daygrid-day-number {
                  font-size: 0.6875rem !important;
                  font-weight: 400 !important;
                  line-height: 1.5 !important;
                }

                @media (max-width: 767px) {
                  .fc-dayGridMonth-view .fc-daygrid-day-frame {
                    min-height: 8.75rem;
                  }
                  .fc-dayGridMonth-view .fc-daygrid-event {
                    margin-inline: 0.125rem;
                    border-radius: 0.25rem;
                  }
                }

                .fc-timegrid-slot-label-cushion,
                .fc-timegrid-axis-cushion {
                  padding-top: 0.125rem;
                  padding-bottom: 0.125rem;
                }
                `}</style>
                  <ScheduleFullCalendarHost
                    calendarRef={calendarRef}
                    key={`${view}:${anchorDate}:${branchId ?? 'all'}:${serviceId ?? 'all'}:${calendarScrollTime}:bounded`}
                    initialView={fcInitialView}
                    views={fcViews}
                    initialDate={anchorDate}
                    timeZone={currentTimeZone}
                    events={calendarEvents}
                    headerToolbar={false}
                    editable={canManageAppointments && view !== 'month'}
                    eventDurationEditable={canManageAppointments && view !== 'month'}
                    eventStartEditable={canManageAppointments && view !== 'month'}
                    // R32: выделение области создаёт запись; клик (без движения) не выделяет,
                    // чтобы остаться сбросом выбора (R24). selectMinDistance разводит клик и drag.
                    selectable={canManageAppointments && view !== 'month'}
                    selectMirror
                    selectMinDistance={5}
                    // #225: keep FC visual slot selection while the create panel is open.
                    // Default unselectAuto=true clears the blue drag highlight on click-elsewhere,
                    // making it look like the slot choice was lost even though the form is prefilled.
                    unselectAuto={false}
                    select={onSelect}
                    nowIndicator
                    dayMaxEvents={view === 'month' && isMobileViewport ? 4 : true}
                    moreLinkContent={(arg) => `+ ещё ${arg.num}`}
                    allDaySlot={false}
                    height={view === 'month' && isMobileViewport ? 'auto' : '100%'}
                    slotMinTime={slotMinTime}
                    slotMaxTime={slotMaxTime}
                    slotLabelContent={(arg) =>
                      formatDoctorCalendarHour(
                        DateTime.fromJSDate(arg.date).setZone(currentTimeZone).hour,
                      )
                    }
                    scrollTime={calendarScrollTime}
                    scrollTimeReset={false}
                    longPressDelay={450}
                    eventLongPressDelay={450}
                    selectLongPressDelay={450}
                    // Клик по заголовку дня → drill-down (D3)
                    navLinks
                    navLinkDayClick={(date) => {
                      const dateKey =
                        DateTime.fromJSDate(date).setZone(currentTimeZone).toISODate() ??
                        anchorDate;
                      drillDownDay(dateKey);
                    }}
                    // CR-1 / Клик по числу в month → drill-down.
                    // Pass dayCellContent only in month view to avoid FullCalendar calling it
                    // (and getting a React element) for timeGrid column headers, which logged a
                    // "1 Issue" console error in the Next.js dev overlay.
                    {...(view === 'month'
                      ? {
                          dayCellContent: (arg: { date: Date }) => {
                            const isToday =
                              DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() ===
                              DateTime.now().setZone(currentTimeZone).toISODate();
                            return (
                              <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                  'fc-daygrid-day-number hover:underline cursor-pointer',
                                  isToday && DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
                                )}
                                onClick={() => {
                                  const dateKey =
                                    DateTime.fromJSDate(arg.date)
                                      .setZone(currentTimeZone)
                                      .toISODate() ?? anchorDate;
                                  drillDownDay(dateKey);
                                }}
                              >
                                {arg.date.getDate()}
                              </Button>
                            );
                          },
                        }
                      : {
                          dayHeaderContent: (arg: { date: Date }) => {
                            const dt = DateTime.fromJSDate(arg.date).setZone(currentTimeZone);
                            const isToday =
                              dt.toISODate() ===
                              DateTime.now().setZone(currentTimeZone).toISODate();
                            return (
                              <Button
                                type="button"
                                variant="ghost"
                                className={cn(
                                  'fc-timegrid-header-link',
                                  isToday && DOCTOR_CALENDAR_TODAY_MARKER_CLASS,
                                )}
                                onClick={() => {
                                  const dateKey = dt.toISODate() ?? anchorDate;
                                  drillDownDay(dateKey);
                                }}
                              >
                                <span className="fc-timegrid-header-weekday">
                                  {dt.setLocale('ru').toFormat('ccc')}
                                </span>
                                <span className="fc-timegrid-header-day">{dt.day}</span>
                              </Button>
                            );
                          },
                        })}
                    eventClick={(arg) => {
                      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
                        suppressCalendarInteractionUntilRef.current = 0;
                        return;
                      }
                      const appointment = arg.event.extendedProps?.appointment as
                        CalendarAppointmentEvent | undefined;
                      if (!appointment) return;
                      openAppointmentDetails(appointment);
                    }}
                    dateClick={(arg) => {
                      if (Date.now() <= suppressCalendarDateClickUntilRef.current) {
                        suppressCalendarDateClickUntilRef.current = 0;
                        return;
                      }
                      if (Date.now() <= suppressCalendarInteractionUntilRef.current) {
                        suppressCalendarInteractionUntilRef.current = 0;
                        return;
                      }
                      if (Date.now() - lastSelectAtRef.current < 500) return;
                      if (filtersPanelOpen) {
                        setFiltersPanelOpen(false);
                        return;
                      }
                      if (selected || showCreatePanel) {
                        closeDraftOrSelectionFromGrid();
                        return;
                      }
                      if (view === 'month') {
                        const dateKey =
                          DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() ??
                          anchorDate;
                        drillDownDay(dateKey);
                        return;
                      }
                      // CAL-ACTION-01: a single tap selects the slot first; the form is only
                      // reached from «Новая запись» in the menu below. Tapping elsewhere moves
                      // the selection instead of only dismissing the previous one.
                      openGridSelection(arg.date, null);
                    }}
                    eventDrop={onDrop}
                    eventResize={onResize}
                    eventContent={(info) => {
                      const appointment = info.event.extendedProps?.appointment as
                        CalendarAppointmentEvent | undefined;
                      if (appointment) {
                        if (view === 'month') {
                          return (
                            <div className="min-w-0 overflow-hidden px-1 py-0.5 text-left leading-tight">
                              <div className="truncate text-[11px] font-medium">
                                {appointment.patientName?.trim() || eventLastName(appointment)}
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                            <div className="truncate font-medium">{eventTitle(appointment)}</div>
                            <div className="truncate opacity-80">
                              {appointmentStatusLabel(appointment.status)}
                            </div>
                          </div>
                        );
                      }
                      // CAL-ACTION-09: фоновые слои (нерабочее время, перерыв) не подписываются
                      // внутри сетки — они читаются только заливкой.
                      if (info.event.display === 'background') return null;
                      return (
                        <div className="truncate px-1 py-0.5 text-[11px]">{info.event.title}</div>
                      );
                    }}
                  />
                  {/* CAL-ACTION-02: the shared doctor popover/menu pattern, anchored to the
                      selection and flipped above or below it by available space. */}
                  {gridSelection ? (
                    <DropdownMenu
                      open={selectionMenuOpen}
                      onOpenChange={(open, eventDetails) => {
                        if (
                          !open &&
                          (eventDetails.reason === 'outside-press' ||
                            eventDetails.reason === 'escape-key')
                        ) {
                          suppressCalendarDateClickUntilRef.current = Date.now() + 500;
                          clearGridSelection();
                          return;
                        }
                        // CAL-ACTION-10: Base UI auto-closes the menu on the same click that runs
                        // a rejected mutation, so this fires in the same tick as
                        // `setSelectionActionError(...)` in `applySelectionScheduleChange`. Do NOT
                        // clear the error here — that raced the close and silently swallowed it,
                        // leaving the doctor with no feedback that nothing was saved. The error is
                        // reset explicitly wherever a fresh attempt actually starts: a new
                        // selection (`openGridSelection`/`clearGridSelection`) or picking «Новая
                        // запись» (`runSelectionAction`).
                        setSelectionMenuOpen(open);
                      }}
                    >
                      <DropdownMenuContent
                        anchor={selectionAnchor}
                        align="center"
                        side="top"
                        sideOffset={8}
                        className="w-auto min-w-[11rem]"
                        data-testid="calendar-selection-menu"
                      >
                        {selectionMenuActions.map((action) => (
                          <DropdownMenuItem
                            key={action}
                            disabled={selectionActionPending}
                            onClick={() => runSelectionAction(action)}
                            data-testid={`calendar-selection-action-${action}`}
                          >
                            {CALENDAR_SELECTION_ACTION_LABELS[action]}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  ) : null}
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="hidden h-full min-h-0 w-full space-y-3 overflow-y-auto xl:block">
          {renderScheduleTopBlocks('aside')}
          <section className={doctorSectionCardClass}>
            <h2 className={doctorSectionTitleClass}>Фильтры</h2>
            {renderScheduleFilters('flex flex-col gap-2', 'w-full')}
          </section>
          {renderScheduleSearchBlock()}
          {/* Владелец 15.09: «в режиме списка можно скрывать вообще цифры в КПИ». Лента тянет
              историю без конца — «период», за который посчитаны плитки, там не определён, и
              числа описывали бы не то, что на экране. В ленте вместо них работает счётчик
              найденного с датой начала (`renderScheduleSearchBlock`). */}
          {showKpi && renderMode !== 'list' ? (
            <KpiRowTab
              kpis={kpis}
              kpisLoading={kpisLoading}
              selectedKpiFilters={selectedKpiFilters}
              periodLabel={kpiPeriod}
              onKpiClick={handleKpiClick}
            />
          ) : null}
        </aside>
      </div>

      <DoctorModal
        open={openWorkingHoursDialog !== null}
        onClose={() => {
          setOpenWorkingHoursDialog(null);
          clearGridSelection();
        }}
        title="Добавить рабочие часы"
        size="sm"
      >
        {openWorkingHoursDialog ? (
          <div className="space-y-4 p-4">
            <label className="block space-y-2 text-base md:text-sm">
              <span>Филиал</span>
              <Select
                value={openWorkingHoursDialog.branchId ?? undefined}
                onValueChange={(value) =>
                  setOpenWorkingHoursDialog((current) =>
                    current ? { ...current, branchId: value ?? null } : current,
                  )
                }
              >
                <SelectTrigger
                  className="w-full"
                  displayLabel={
                    filters.branches.find((branch) => branch.id === openWorkingHoursDialog.branchId)
                      ?.label ?? 'Выберите филиал'
                  }
                />
                <SelectContent>
                  {filters.branches.map((branch) => (
                    <SelectItem key={branch.id} value={branch.id} label={branch.label}>
                      {branch.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </label>

            {selectionActionError ? (
              <p className="text-sm text-destructive">{selectionActionError}</p>
            ) : null}

            <DoctorModalFooter>
              <Button
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setOpenWorkingHoursDialog(null);
                  clearGridSelection();
                }}
              >
                Отмена
              </Button>
              <Button
                type="button"
                size="sm"
                disabled={selectionActionPending || !openWorkingHoursDialog.branchId}
                onClick={() => {
                  if (!openWorkingHoursDialog.branchId) return;
                  void applySelectionScheduleChange('open-for-booking', {
                    branchId: openWorkingHoursDialog.branchId,
                  });
                }}
              >
                Сохранить
              </Button>
            </DoctorModalFooter>
          </div>
        ) : null}
      </DoctorModal>

      <DoctorModal
        open={datePickerOpen}
        onClose={() => setDatePickerOpen(false)}
        title="Перейти к дате"
        size="content"
      >
        <DayPicker
          mode="single"
          locale={ru}
          weekStartsOn={1}
          selected={DateTime.fromISO(mobileVisibleDate, {
            zone: currentTimeZone,
          }).toJSDate()}
          defaultMonth={DateTime.fromISO(mobileVisibleDate, {
            zone: currentTimeZone,
          }).toJSDate()}
          onSelect={(date) => {
            if (date) jumpToDate(date);
          }}
          className="doctor-day-picker mx-auto p-3"
        />
      </DoctorModal>

      <DoctorModal
        open={filtersPanelOpen && !isWideScheduleLayout}
        onClose={() => setFiltersPanelOpen(false)}
        title="Фильтры"
        size="lg"
        desktopPresentation="right-sheet"
        bodyClassName="p-4"
      >
        <div id="schedule-filters-panel" className="flex flex-col gap-3">
          {/* Владелец 15.09: «в модалке мобильного пусть будет так же две верхние строки — выбор
              периода на экране и режима» — блоки «Вид»/«Период» теперь показываются и на
              мобильном (раньше стояли только для планшета). Поиск идёт ПОСЛЕ фильтров — «поиск
              перенести под блок с выбором филиала/услуги/отмен … и в мобиле». */}
          {renderScheduleTopBlocks('modal')}
          {renderScheduleFilters('flex flex-col gap-2', 'w-full')}
          {renderScheduleSearchBlock()}
          {/* Владелец 15.09: «в режиме списка можно скрывать вообще цифры в КПИ». Лента тянет
              историю без конца — «период», за который посчитаны плитки, там не определён, и
              числа описывали бы не то, что на экране. В ленте вместо них работает счётчик
              найденного с датой начала (`renderScheduleSearchBlock`). */}
          {showKpi && renderMode !== 'list' ? (
            <KpiRowTab
              kpis={kpis}
              kpisLoading={kpisLoading}
              selectedKpiFilters={selectedKpiFilters}
              periodLabel={kpiPeriod}
              onKpiClick={handleKpiClick}
            />
          ) : null}
        </div>
      </DoctorModal>

      {!isMobileViewport ? (
        <DoctorModal
          open={eventPanelOpen}
          onClose={clearDraftAndPanel}
          onRightSheetOutsidePress={() => {
            suppressCalendarDateClickUntilRef.current = Date.now() + 1000;
          }}
          title={eventPanelTitle}
          size="lg"
          desktopPresentation="right-sheet"
          bodyClassName="p-4"
        >
          {eventPanelNode}
        </DoctorModal>
      ) : null}

      {isMobileViewport ? (
        <DoctorModal
          open={eventPanelOpen}
          onClose={clearDraftAndPanel}
          title={eventPanelTitle}
          size="lg"
        >
          {eventPanelNode}
        </DoctorModal>
      ) : null}

      <DoctorCalendarRescheduleDialog
        pending={pendingReschedule}
        timeZone={currentTimeZone}
        comment={rescheduleComment}
        busy={rescheduleBusy}
        error={rescheduleError}
        onCommentChange={setRescheduleComment}
        onConfirm={confirmRescheduleConfirm}
        onCancel={cancelRescheduleConfirm}
      />

    </div>
  );
}
