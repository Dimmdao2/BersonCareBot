'use client';

import 'react-day-picker/style.css';
import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import { DateTime } from 'luxon';
import { DayPicker } from 'react-day-picker';
import { ru } from 'react-day-picker/locale';
import { Calendar, CalendarDays, Columns3, Filter, List, Search } from 'lucide-react';
import { Input } from '@/shared/ui/doctor/primitives/input';
import { Button } from '@/shared/ui/doctor/primitives/button';
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
  DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
} from '@/shared/ui/doctor/doctorWorkspaceLayout';
import {
  buildDoctorCalendarNonWorkingRanges,
  doctorCalendarNonWorkingClassNames,
  formatDoctorCalendarHour,
} from '@/shared/ui/doctor/calendar/doctorCalendarPresentation';
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
import type {
  CalendarOptions as FullCalendarOptions,
  EventInput,
} from '@fullcalendar/core';
import type {
  CalendarAppointmentEvent,
  CalendarEvent,
  CalendarFilterMeta,
} from '@/modules/booking-calendar/types';
import type { ScheduleKpis } from '@/modules/doctor-appointments/ports';
import type { ScheduleTabProps } from '../scheduleTabRegistry';
import { KpiPreviewModal } from '@/shared/ui/doctor/KpiPreviewModal';
import { AppointmentKpiItem } from '@/shared/ui/doctor/AppointmentKpiItem';
import { DoctorModal } from '@/shared/ui/doctor/DoctorModal';
import { useIsMobileViewport } from '@/shared/ui/doctor/primitives/useIsMobileViewport';
import { useViewportMinWidth } from '@/shared/hooks/useViewportMinWidth';
import { Switch } from '@/shared/ui/doctor/primitives/switch';
import { doctorSectionCardClass, doctorSectionTitleClass } from '@/shared/ui/doctor/doctorVisual';
import { routePaths } from '@/app-layer/routes/paths';
import { DOCTOR_SCHEDULE_CALENDAR_REFRESH_EVENT } from '../scheduleCalendarEvents';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import { deriveCalendarInitialScrollTime } from '@/modules/booking-calendar/visibleTimeWindow';
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
import { MobileScrollableMonthCalendar } from './MobileScrollableMonthCalendar';

type FullCalendarInstance = InstanceType<typeof FullCalendar>;

const MOBILE_MONTH_WINDOW_SHIFT_MONTHS = 3;
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
    loading: () => (
      <div className="min-h-[28rem] animate-pulse rounded-lg border border-border bg-muted/30" />
    ),
  },
);

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = '/api/doctor/booking-engine';
const KPIS_API = '/api/doctor/schedule-kpis';
const SCHEDULE_FILTERS_STORAGE_KEY = 'therapysto.doctor.schedule.filters.v1';
const INACTIVE_TOOLBAR_BUTTON_CLASS = 'bg-white hover:bg-muted';

type CachedScheduleFilters = {
  branchId: string | null;
  serviceId: string | null;
  scope: DoctorScheduleScopeState['scope'];
  specialistId: string | null;
  showCancelledAppointments: boolean;
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
    return {
      branchId: value.branchId,
      serviceId: value.serviceId,
      scope: value.scope,
      specialistId: value.specialistId,
      showCancelledAppointments: value.showCancelledAppointments,
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
  if (!error) return 'Не удалось перенести запись.';
  if (error === 'external_slot_taken') return 'Время уже занято.';
  if (error === 'slot_overlap') return 'Слот уже занят другой записью этого специалиста.';
  if (error === 'not_found') return 'Запись не найдена.';
  if (error.startsWith('load_failed')) return 'Не удалось сохранить перенос. Попробуйте ещё раз.';
  return error;
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

type CalendarDraftSlot = {
  start: string;
  end: string;
};

type MobileCalendarRange = {
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
// Helper: period label
// ---------------------------------------------------------------------------

function periodLabel(view: CalV26View, anchorDate: string, zone: string): string {
  const anchor = DateTime.fromISO(anchorDate, { zone });

  if (view === 'day') {
    return anchor.setLocale('ru').toFormat('cccc, d LLLL yyyy');
  }
  if (view === 'month') {
    return anchor.setLocale('ru').toFormat('LLLL yyyy');
  }
  if (view === '3days') {
    const start = anchor.startOf('day');
    const end = anchor.startOf('day').plus({ days: 2 });
    if (start.month === end.month) {
      return `${start.setLocale('ru').toFormat('d')}–${end.setLocale('ru').toFormat('d LLLL yyyy')}`;
    }
    return `${start.setLocale('ru').toFormat('d LLLL')} – ${end.setLocale('ru').toFormat('d LLLL yyyy')}`;
  }
  if (view === 'weekgrid') {
    const start = anchor.startOf('week');
    const end = anchor.endOf('week');
    if (start.month === end.month) {
      return `${start.setLocale('ru').toFormat('d')}–${end.setLocale('ru').toFormat('d LLLL yyyy')}`;
    }
    return `${start.setLocale('ru').toFormat('d LLLL')} – ${end.setLocale('ru').toFormat('d LLLL yyyy')}`;
  }
  return '';
}

function mobilePeriodLabel(anchorDate: string, zone: string): string {
  return DateTime.fromISO(anchorDate, { zone }).setLocale('ru').toFormat('LLLL yyyy');
}

function mobileMonthCalendarRangeAround(anchorDate: string, zone: string): MobileCalendarRange {
  const anchor = DateTime.fromISO(anchorDate, { zone }).startOf('month');
  return {
    start: anchor.minus({ months: 6 }).toISODate() ?? anchorDate,
    end: anchor.plus({ months: 4 }).toISODate() ?? anchorDate,
  };
}

function mobileCalendarRangeInstants(
  range: MobileCalendarRange,
  zone: string,
): { from: string; to: string } {
  const from = DateTime.fromISO(range.start, { zone }).startOf('day');
  const to = DateTime.fromISO(range.end, { zone }).startOf('day');
  return {
    from: from.toISO() ?? range.start,
    to: to.toISO() ?? range.end,
  };
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
  // appointment
  if (isCancelledAppointmentStatus(event.status))
    return '!bg-destructive/15 text-destructive/80 !border-destructive/20 line-through';
  if (event.status === 'awaiting_payment' || event.prepaymentPending)
    return '!bg-amber-500/15 text-amber-900 !border-amber-500/40';
  if (event.packageUsageRef || event.packageTitle)
    return '!bg-violet-500/15 text-violet-900 !border-violet-500/40';
  if (event.branchColor) return 'text-foreground';
  // дефолтная запись чуть насыщеннее (R10 «чуть темнее для всего»); прошлые
  // дополнительно приглушаются через .fc-event-past opacity в <style>.
  return '!bg-primary/15 text-foreground !border-primary/35';
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  if (!/^#[0-9A-Fa-f]{6}$/.test(hex)) return null;
  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16),
  };
}

function rgba(hex: string, alpha: number): string | null {
  const rgb = hexToRgb(hex);
  if (!rgb) return null;
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${alpha})`;
}

function appointmentBranchColors(event: CalendarAppointmentEvent): {
  backgroundColor?: string;
  borderColor?: string;
} {
  if (
    !event.branchColor ||
    isCancelledAppointmentStatus(event.status) ||
    event.status === 'awaiting_payment' ||
    event.prepaymentPending ||
    event.packageUsageRef ||
    event.packageTitle
  ) {
    return {};
  }
  const backgroundColor = rgba(event.branchColor, 0.16);
  const borderColor = rgba(event.branchColor, 0.42);
  if (!backgroundColor || !borderColor) return {};
  return { backgroundColor, borderColor };
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

type ScheduleKpiNumberKey = Exclude<keyof ScheduleKpis, 'firstVisitIds'>;

const KPI_ITEMS: Array<{ key: ScheduleKpiNumberKey; label: string }> = [
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
  onKpiClick?: (key: ScheduleKpiNumberKey) => void;
};

function KpiRowTab({ kpis, kpisLoading, onKpiClick }: KpiRowTabProps) {
  return (
    <div className="grid grid-cols-2 gap-2" data-testid="cal-kpi-row">
      {KPI_ITEMS.map(({ key, label }) => {
        const value = kpis?.[key] ?? 0;
        const handleClick =
          key !== 'recordsInPeriod' && value > 0 && onKpiClick ? () => onKpiClick(key) : undefined;
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
            testId={`kpi-${key}`}
          />
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// List view — period-bound list grouped by day (replaces FeedView)
// ---------------------------------------------------------------------------

type ListDayCardProps = {
  dateKey: string;
  label: string;
  appointments: CalendarAppointmentEvent[];
  timeZone: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  nextApptId?: string;
};

// R29: фон строки списка повторяет статусную палитру календаря (eventClassName);
// прошедшие приглушаются, отменённые — destructive + line-through.
function listRowClass(appt: CalendarAppointmentEvent, timeZone: string): string {
  if (isCancelledAppointmentStatus(appt.status))
    return 'border-destructive/25 bg-destructive/10 text-destructive/80 hover:bg-destructive/15';
  const isPast = parseFeedInstant(appt.startAt, timeZone) < DateTime.now();
  const base =
    appt.status === 'awaiting_payment' || appt.prepaymentPending
      ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15'
      : appt.packageUsageRef || appt.packageTitle
        ? 'border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/15'
        : 'border-primary/30 bg-primary/10 hover:bg-primary/15';
  return cn(base, isPast && 'opacity-60');
}

function ListDayCard({
  dateKey,
  label,
  appointments,
  timeZone,
  onSelect,
  nextApptId,
}: ListDayCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
      data-testid={`list-day-${dateKey}`}
    >
      <p className="text-sm font-semibold text-foreground capitalize">{label}</p>
      <div className="flex flex-col gap-1">
        {appointments.map((appt) => {
          const start = parseFeedInstant(appt.startAt, timeZone).toFormat('HH:mm');
          const end = parseFeedInstant(appt.endAt, timeZone).toFormat('HH:mm');
          const cancelled = isCancelledAppointmentStatus(appt.status);
          const isNext = appt.id === nextApptId;
          return (
            <Button
              key={appt.id}
              type="button"
              variant="ghost"
              onClick={() => onSelect(appt)}
              className={cn(
                'flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm',
                isNext ? 'ring-2 ring-primary/70 ring-offset-1' : '',
                listRowClass(appt, timeZone),
              )}
              data-testid={`list-appt-${appt.id}`}
            >
              <span className="shrink-0 font-semibold tabular-nums">
                {start}–{end}
              </span>
              <span className={cn('min-w-0 truncate', cancelled && 'line-through')}>
                {appt.patientName ?? 'Запись'}
              </span>
              {appt.packageUsageRef || appt.packageTitle ? (
                <span
                  className="shrink-0 rounded-md border border-violet-500/30 bg-violet-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-violet-900"
                  title={appt.packageTitle ?? undefined}
                >
                  {formatPatientPackageShortLabel(appt.packageDisplayNumber)}
                </span>
              ) : null}
              {isNext && (
                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Следующая
                </span>
              )}
              {cancelled ? (
                <span className="shrink-0 text-xs font-medium text-destructive">
                  {appointmentStatusLabel(appt.status)}
                </span>
              ) : (
                <span className="shrink-0 text-xs text-muted-foreground">
                  {appointmentStatusLabel(appt.status)}
                </span>
              )}
              {appt.branchTitle ? (
                <span className="ml-auto shrink-0 text-xs opacity-70">{appt.branchTitle}</span>
              ) : null}
            </Button>
          );
        })}
      </div>
    </div>
  );
}

type ListViewProps = {
  events: CalendarEvent[];
  anchorDate: string;
  timeZone: string;
  rangeFrom: string;
  rangeTo: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
};

function ListView({ events, timeZone, rangeFrom, rangeTo, onSelect }: ListViewProps) {
  const from = DateTime.fromISO(rangeFrom, { zone: timeZone });
  const to = DateTime.fromISO(rangeTo, { zone: timeZone });

  // Build list of all days in range that have appointments
  const totalDays = Math.ceil(to.diff(from, 'days').days);
  const dayGroups: Array<{
    dateKey: string;
    label: string;
    appointments: CalendarAppointmentEvent[];
  }> = [];

  for (let i = 0; i < totalDays; i++) {
    const day = from.plus({ days: i });
    const dayKey = day.toISODate() ?? '';
    const appointments = events
      .filter(
        (e): e is CalendarAppointmentEvent =>
          e.kind === 'appointment' &&
          // R29: показываем и отменённые (визуально отдельно + «Отмена»); раньше (R15) их прятали.
          parseFeedInstant(e.startAt, timeZone).toISODate() === dayKey,
      )
      // активные выше, отменённые — в конце дня; внутри группы — по времени
      .sort((a, b) => {
        const ac = isCancelledAppointmentStatus(a.status) ? 1 : 0;
        const bc = isCancelledAppointmentStatus(b.status) ? 1 : 0;
        if (ac !== bc) return ac - bc;
        return a.startAt < b.startAt ? -1 : 1;
      });
    if (appointments.length > 0) {
      dayGroups.push({
        dateKey: dayKey,
        label: day.setLocale('ru').toFormat('cccc, d LLLL'),
        appointments,
      });
    }
  }

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

  return (
    <div
      className="flex h-full min-h-0 flex-col gap-3 overflow-y-auto pr-1 pb-4"
      data-testid="list-view"
    >
      {dayGroups.length === 0 ? (
        <div
          className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground"
          data-testid="list-empty"
        >
          Записей в этом периоде нет
        </div>
      ) : (
        dayGroups.map(({ dateKey, label, appointments }) => (
          <ListDayCard
            key={dateKey}
            dateKey={dateKey}
            label={label}
            appointments={appointments}
            timeZone={timeZone}
            onSelect={onSelect}
            nextApptId={nextApptId}
          />
        ))
      )}
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
}: ScheduleTabProps) {
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
  const calendarViewportRef = useRef<HTMLDivElement>(null);
  const mobileScrollPositionedRangeRef = useRef<string | null>(null);
  const mobileScrollRestoreDateRef = useRef<string | null>(null);
  const mobileRangeExpandingRef = useRef(false);
  const mobileMonthScrollFrameRef = useRef<number | null>(null);
  const mobileCalendarMountedRef = useRef(false);
  const mobileBootstrapRefreshPendingRef = useRef(false);
  const mobileBootstrapRefreshFrameRef = useRef<number | null>(null);
  const mobileBootstrapDeferredLoadKeyRef = useRef<string | null>(null);
  const recentLoadRef = useRef<{ key: string; startedAt: number } | null>(null);

  // ─── State ─────────────────────────────────────────────────────────────────
  const [timeZone] = useState(initialTimeZone ?? DEFAULT_APP_DISPLAY_TIMEZONE);
  const [view, setViewState] = useState<CalV26View>(
    () => bootstrap?.view ?? resolveView(deepLinkParams.view),
  );
  const [anchorDate, setAnchorDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const [mobileMonthCalendarRange, setMobileMonthCalendarRange] = useState<MobileCalendarRange>(() =>
    mobileMonthCalendarRangeAround(
      bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
      timeZone,
    ),
  );
  const [mobileVisibleDate, setMobileVisibleDateState] = useState<string>(
    () => bootstrap?.anchorDate ?? resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const mobileVisibleDateRef = useRef(mobileVisibleDate);
  const mobilePeriodButtonRef = useRef<HTMLButtonElement>(null);
  const [branchId, setBranchIdState] = useState<string | null>(
    () => bootstrap?.branchId ?? deepLinkParams.location ?? null,
  );
  const [serviceId, setServiceIdState] = useState<string | null>(
    () => bootstrap?.serviceId ?? deepLinkParams.service ?? null,
  );
  const scopeBootstrap = scheduleScopeBootstrap ?? EMPTY_SCHEDULE_SCOPE_BOOTSTRAP;
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
  const [filterCacheReady, setFilterCacheReady] = useState(false);
  const isMobileViewport = useIsMobileViewport();
  const isWideScheduleLayout = useViewportMinWidth(1280);
  // #227: ref к FullCalendar для вызова unselect() при отмене создания
  const calendarRef = useRef<FullCalendarInstance>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [kpiModalFilter, setKpiModalFilter] = useState<ScheduleKpiNumberKey | null>(null);
  // R32: время старта/конца, подставляемое в форму создания при выделении области.
  const [createInitialStart, setCreateInitialStart] = useState<string | null>(null);
  // #225: время конца из drag-интервала → используется как начальная длительность в форме создания.
  const [createInitialEnd, setCreateInitialEnd] = useState<string | null>(null);
  const [createInitialBranchId, setCreateInitialBranchId] = useState<string | null>(null);
  const [createInitialServiceId, setCreateInitialServiceId] = useState<string | null>(null);
  const [draftSlot, setDraftSlot] = useState<CalendarDraftSlot | null>(null);
  const [createFormDirty, setCreateFormDirty] = useState(false);
  const lastSelectAtRef = useRef(0);
  const [calendarSettings, setCalendarSettings] = useState<CalendarDoctorSettings>(
    () => bootstrap?.settings ?? DEFAULT_CALENDAR_SETTINGS,
  );
  const [pending, startTransition] = useTransition();

  const mobileScrollableMonthGrid =
    isMobileViewport && view === 'month' && renderMode === 'calendar';
  const calendarFeedRange = useMemo(
    () =>
      mobileScrollableMonthGrid
        ? mobileCalendarRangeInstants(mobileMonthCalendarRange, timeZone)
        : visibleRange(view, anchorDate, timeZone),
    [anchorDate, mobileMonthCalendarRange, mobileScrollableMonthGrid, timeZone, view],
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
      setViewState(v);
      onDeepLinkChange('view', v);
    },
    [onDeepLinkChange],
  );

  const setAnchorDate = useCallback(
    (d: string) => {
      setAnchorDateState(d);
      onDeepLinkChange('date', d);
    },
    [onDeepLinkChange],
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

  const updateMobileVisibleDate = useCallback(
    (dateKey: string, commit = false) => {
      mobileVisibleDateRef.current = dateKey;
      if (mobilePeriodButtonRef.current) {
        mobilePeriodButtonRef.current.textContent = mobilePeriodLabel(dateKey, timeZone);
      }
      if (commit) {
        setMobileVisibleDateState((current) => (current === dateKey ? current : dateKey));
      }
    },
    [timeZone],
  );

  useEffect(() => {
    if (!isMobileViewport || view !== 'weekgrid') return;
    queueMicrotask(() => setView('3days'));
  }, [isMobileViewport, setView, view]);

  // ─── Drill-down day ────────────────────────────────────────────────────────

  const drillDownDay = useCallback(
    (dateKey: string) => {
      // Remember current view for Назад
      const backView = view === 'day' ? (drillBackView ?? '3days') : view;
      setDrillBackView(backView);
      onDeepLinkChange('from', backView);
      setView('day');
      setAnchorDate(dateKey);
    },
    [view, drillBackView, onDeepLinkChange, setView, setAnchorDate],
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
          const range =
            isMobileViewport && v === 'month' && renderMode === 'calendar'
              ? mobileCalendarRangeInstants(mobileMonthCalendarRange, timeZone)
              : visibleRange(v, anchor, timeZone);
          const from = range.from;
          const to = range.to;

          // Map v26 view to API view param
          const apiView =
            isMobileViewport && v === 'month' && renderMode === 'calendar'
              ? 'feed'
              : v === '3days'
                ? '3days'
                : v === 'weekgrid'
                  ? 'week'
                  : v === 'month'
                    ? 'month'
                    : 'day';

          const qs = buildQuery({
            view: apiView,
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
          setError(null);
          // Do not write branchId/serviceId from feed into load-key state — that retriggers
          // load() in single-branch clinics. Create-form defaults resolve from filters on open.
        } catch {
          if (gen !== loadGenerationRef.current) return;
          setError('network_error');
        }
      });
    },
    [
      view,
      anchorDate,
      branchId,
      serviceId,
      timeZone,
      scheduleScope,
      isMobileViewport,
      mobileMonthCalendarRange,
      renderMode,
    ],
  );

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
    loadFeed(undefined, undefined, generation);
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

  const queueMobileBootstrapRefresh = useCallback(() => {
    if (mobileBootstrapRefreshFrameRef.current !== null) return;
    mobileBootstrapRefreshFrameRef.current = window.requestAnimationFrame(() => {
      mobileBootstrapRefreshFrameRef.current = window.requestAnimationFrame(() => {
        mobileBootstrapRefreshFrameRef.current = null;
        mobileBootstrapDeferredLoadKeyRef.current = null;
        loadFeed(undefined, undefined, ++loadGenerationRef.current);
      });
    });
  }, [loadFeed]);

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
    if (
      mobileBootstrapDeferredLoadKeyRef.current === calendarLoadKey &&
      (mobileBootstrapRefreshPendingRef.current ||
        mobileBootstrapRefreshFrameRef.current !== null)
    ) {
      return;
    }
    if (
      mobileBootstrapDeferredLoadKeyRef.current !== null &&
      mobileBootstrapDeferredLoadKeyRef.current !== calendarLoadKey
    ) {
      mobileBootstrapDeferredLoadKeyRef.current = null;
      mobileBootstrapRefreshPendingRef.current = false;
      if (mobileBootstrapRefreshFrameRef.current !== null) {
        window.cancelAnimationFrame(mobileBootstrapRefreshFrameRef.current);
        mobileBootstrapRefreshFrameRef.current = null;
      }
    }
    if (
      ssrLoadKeyRef.current !== null &&
      calendarLoadKey === ssrLoadKeyRef.current
    ) {
      ssrLoadKeyRef.current = null;
      const needsExpandedMobileRange =
        window.matchMedia('(max-width: 767px)').matches &&
        renderMode === 'calendar' &&
        view === 'month';
      if (needsExpandedMobileRange) {
        mobileBootstrapDeferredLoadKeyRef.current = calendarLoadKey;
        if (mobileCalendarMountedRef.current) {
          queueMobileBootstrapRefresh();
        } else {
          mobileBootstrapRefreshPendingRef.current = true;
        }
      }
      return;
    }
    ssrLoadKeyRef.current = null;
    queueMicrotask(() => load());
  }, [calendarLoadKey, load, queueMobileBootstrapRefresh, renderMode, view]);

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
    if (next) setAnchorDate(next);
  }

  function goToday() {
    const today = DateTime.now().setZone(timeZone).toISODate();
    if (!today) return;
    updateMobileVisibleDate(today, true);
    if (mobileScrollableMonthGrid) {
      mobileScrollRestoreDateRef.current = today;
      mobileScrollPositionedRangeRef.current = null;
    }
    if (
      mobileScrollableMonthGrid &&
      (today < mobileMonthCalendarRange.start || today >= mobileMonthCalendarRange.end)
    ) {
      mobileRangeExpandingRef.current = true;
      setMobileMonthCalendarRange(mobileMonthCalendarRangeAround(today, timeZone));
    } else if (mobileScrollableMonthGrid) {
      positionMobileCalendar(today);
    }
    setAnchorDate(today);
  }

  useEffect(() => {
    if (!mobileScrollableMonthGrid) return;
    if (anchorDate >= mobileMonthCalendarRange.start && anchorDate < mobileMonthCalendarRange.end) {
      return;
    }
    mobileScrollRestoreDateRef.current = anchorDate;
    queueMicrotask(() =>
      setMobileMonthCalendarRange(mobileMonthCalendarRangeAround(anchorDate, timeZone)),
    );
  }, [
    anchorDate,
    mobileMonthCalendarRange,
    mobileScrollableMonthGrid,
    timeZone,
  ]);

  const positionMobileCalendar = useCallback(
    (dateKey: string) => {
      window.requestAnimationFrame(() => {
        const scroller = calendarViewportRef.current;
        if (!scroller) return;
        const dateCell = scroller.querySelector<HTMLElement>(
          `.fc-daygrid-day[data-date="${dateKey}"]`,
        );
        if (dateCell) {
          const scrollerBox = scroller.getBoundingClientRect();
          const cellBox = dateCell.getBoundingClientRect();
          const weekdayHeaderHeight =
            scroller
              .querySelector<HTMLElement>('.doctor-mobile-native-months > .sticky')
              ?.getBoundingClientRect().height ?? 0;
          scroller.scrollTop = Math.max(
            0,
            scroller.scrollTop + cellBox.top - scrollerBox.top - weekdayHeaderHeight,
          );
        }
        window.requestAnimationFrame(() => {
          mobileRangeExpandingRef.current = false;
        });
      });
    },
    [],
  );

  useEffect(() => {
    if (!mobileScrollableMonthGrid) return;
    const rangeKey = `month:${mobileMonthCalendarRange.start}:${mobileMonthCalendarRange.end}`;
    if (mobileScrollPositionedRangeRef.current === rangeKey) return;
    mobileScrollPositionedRangeRef.current = rangeKey;
    const target = mobileScrollRestoreDateRef.current ?? mobileVisibleDateRef.current;
    mobileScrollRestoreDateRef.current = null;
    mobileRangeExpandingRef.current = true;
    positionMobileCalendar(target);
  }, [
    mobileMonthCalendarRange,
    mobileScrollableMonthGrid,
    positionMobileCalendar,
  ]);

  useEffect(
    () => () => {
      if (mobileMonthScrollFrameRef.current != null) {
        window.cancelAnimationFrame(mobileMonthScrollFrameRef.current);
      }
      if (mobileBootstrapRefreshFrameRef.current != null) {
        window.cancelAnimationFrame(mobileBootstrapRefreshFrameRef.current);
        mobileBootstrapRefreshFrameRef.current = null;
        if (mobileBootstrapDeferredLoadKeyRef.current !== null) {
          mobileBootstrapRefreshPendingRef.current = true;
        }
      }
    },
    [],
  );

  const handleMobileCalendarReady = useCallback(() => {
    mobileCalendarMountedRef.current = true;
    if (mobileBootstrapRefreshPendingRef.current) {
      mobileBootstrapRefreshPendingRef.current = false;
      queueMobileBootstrapRefresh();
    }
  }, [queueMobileBootstrapRefresh]);

  useEffect(() => {
    if (mobileScrollableMonthGrid) {
      handleMobileCalendarReady();
    }
  }, [handleMobileCalendarReady, mobileScrollableMonthGrid]);

  const handleMobileCalendarDatesSet = useCallback(() => {
    handleMobileCalendarReady();
  }, [handleMobileCalendarReady]);

  const handleMobileCalendarScroll = useCallback(
    (target: HTMLElement) => {
      if (!mobileScrollableMonthGrid) return;
      if (mobileMonthScrollFrameRef.current != null) return;
      mobileMonthScrollFrameRef.current = window.requestAnimationFrame(() => {
        mobileMonthScrollFrameRef.current = null;
        const bounds = target.getBoundingClientRect();
        const visibleCell = document
          .elementFromPoint(bounds.left + bounds.width / 2, bounds.top + bounds.height / 3)
          ?.closest<HTMLElement>('.fc-daygrid-day[data-date]');
        const visibleDate = visibleCell?.dataset.date ?? mobileVisibleDateRef.current;
        const visibleMonth = DateTime.fromISO(visibleDate, { zone: timeZone })
          .startOf('month')
          .toISODate();
        if (visibleMonth) {
          updateMobileVisibleDate(visibleMonth);
        }
        if (mobileRangeExpandingRef.current) return;
        const edgeThreshold = target.clientHeight * 0.35;
        const nearStart = target.scrollTop <= edgeThreshold;
        const nearEnd =
          target.scrollHeight - target.clientHeight - target.scrollTop <= edgeThreshold;
        if (!nearStart && !nearEnd) return;
        mobileRangeExpandingRef.current = true;
        mobileScrollRestoreDateRef.current = visibleDate;
        mobileScrollPositionedRangeRef.current = null;
        updateMobileVisibleDate(visibleMonth ?? visibleDate, true);
        setMobileMonthCalendarRange((current) => ({
          start:
            DateTime.fromISO(current.start, { zone: timeZone })
              .plus({
                months: nearStart
                  ? -MOBILE_MONTH_WINDOW_SHIFT_MONTHS
                  : MOBILE_MONTH_WINDOW_SHIFT_MONTHS,
              })
              .startOf('month')
              .toISODate() ?? current.start,
          end:
            DateTime.fromISO(current.end, { zone: timeZone })
              .plus({
                months: nearStart
                  ? -MOBILE_MONTH_WINDOW_SHIFT_MONTHS
                  : MOBILE_MONTH_WINDOW_SHIFT_MONTHS,
              })
              .startOf('month')
              .toISODate() ?? current.end,
        }));
      });
    },
    [
      mobileScrollableMonthGrid,
      timeZone,
      updateMobileVisibleDate,
    ],
  );

  function jumpToDate(date: Date) {
    const dateKey = DateTime.fromObject(
      { year: date.getFullYear(), month: date.getMonth() + 1, day: date.getDate() },
      { zone: timeZone },
    ).toISODate();
    if (!dateKey) return;
    updateMobileVisibleDate(dateKey, true);
    if (mobileScrollableMonthGrid) {
      mobileScrollRestoreDateRef.current = dateKey;
      mobileScrollPositionedRangeRef.current = null;
    }
    if (
      mobileScrollableMonthGrid &&
      (dateKey < mobileMonthCalendarRange.start || dateKey >= mobileMonthCalendarRange.end)
    ) {
      mobileRangeExpandingRef.current = true;
      setMobileMonthCalendarRange(mobileMonthCalendarRangeAround(dateKey, timeZone));
    } else if (mobileScrollableMonthGrid) {
      positionMobileCalendar(dateKey);
    }
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
    });
  }, [branchId, filterCacheReady, scheduleScope, serviceId, showCancelledAppointments]);

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
        noneLabel="Локация"
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
        noneLabel="Услуга"
        options={filters.services}
        value={serviceId}
        onChange={setServiceId}
        onOpenChange={handleCalendarFilterOpenChange}
        className={controlClassName}
      />
      <div className="flex h-8 w-full items-center justify-between gap-3 px-1 text-sm text-foreground">
        <span>Показывать отмены</span>
        <Switch
          checked={showCancelledAppointments}
          onCheckedChange={setShowCancelledAppointments}
          aria-label="Показывать отмены"
        />
      </div>
    </div>
  );

  const displayableCalendarEvents = useMemo(
    () =>
      (data?.events ?? []).filter(
        (event) =>
          showCancelledAppointments ||
          event.kind !== 'appointment' ||
          !isCancelledAppointmentStatus(event.status),
      ),
    [data?.events, showCancelledAppointments],
  );

  const currentTimeZone = data?.timeZone ?? timeZone;
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
    setSelected(null);
    setShowCreatePanel(false);
    setCreateInitialStart(null);
    setCreateInitialEnd(null);
    setCreateInitialBranchId(null);
    setCreateInitialServiceId(null);
    setDraftSlot(null);
    setCreateFormDirty(false);
    onDeepLinkChange('appt', null);
    calendarRef.current?.getApi().unselect();
  }, [onDeepLinkChange]);

  const openCreateDraft = useCallback(
    (start: Date, end: Date | null) => {
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
      setShowCreatePanel(true);
      onDeepLinkChange('appt', null);
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
    ],
  );

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
    const mapped = displayableCalendarEvents
      .map((event) => {
        // Рабочее время — не рендерим (фон белый).
        if (event.kind === 'working') return null;

        // SCH-10 / owner-feedback: перерыв («обед») рисуем тем же ЛЁГКИМ прозрачным
        // фоном, что и нерабочее время (#eee/0.6), а не плотной тёмной плашкой —
        // владельцу нужен «обед как лёгкий фон». Отличает его подпись «Перерыв» и то,
        // что он лежит внутри рабочей (белой) полосы, а не по краям смены.
        if (event.kind === 'break' && isTimeGrid) {
          return {
            id: `break:${event.id}`,
            start: toFcDate(event.startAt, currentTimeZone),
            end: toFcDate(event.endAt, currentTimeZone),
            title: 'Перерыв',
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
          // Для month-вида: только фамилия (D4)
          title: view === 'month' ? eventLastName(event) : eventTitle(event),
          editable: !isCancelledAppointmentStatus(event.status),
          durationEditable: !isCancelledAppointmentStatus(event.status),
          startEditable: !isCancelledAppointmentStatus(event.status),
          classNames: [eventClassName(event)],
          ...appointmentBranchColors(event),
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
    view,
    calendarFeedRange,
    currentTimeZone,
    loMinute,
    hiMinute,
    draftSlot,
  ]);

  // ─── Reschedule (drag/resize) ──────────────────────────────────────────────

  const performReschedule = useCallback(
    async (
      appointment: CalendarAppointmentEvent,
      startAt: string,
      endAt: string,
      staffComment?: string,
    ): Promise<{ ok: boolean; error?: string }> => {
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
    [],
  );

  // R34: drag/resize не применяются сразу — открываем диалог подтверждения.
  const openRescheduleConfirm = useCallback((arg: any) => {
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
  }, []);

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

  // R32: выделение области по сетке → форма создания с подставленным временем.
  const onSelect = useCallback(
    (arg: { start?: Date | null; end?: Date | null }) => {
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
      window.setTimeout(() => openCreateDraft(start, end ?? null), 0);
    },
    [filtersPanelOpen, openCreateDraft],
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

  // ─── FullCalendar view mapping ─────────────────────────────────────────────

  const fcView =
    view === 'day'
      ? 'timeGridDay'
      : view === 'weekgrid'
        ? 'timeGridWeek'
        : view === 'month'
          ? 'dayGridMonth'
          : 'timeGridDay'; // 3days handled as custom range — use timeGridDay with visibleRange

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

  const showKpi = doctorStatisticsEnabled;

  // visibleRange for list mode
  const listRange = useMemo(
    () => visibleRange(view, anchorDate, currentTimeZone),
    [view, anchorDate, currentTimeZone],
  );

  // Calendar/list filters: cancellations are hidden by default; search narrows the remainder.
  const visibleEvents = useMemo<CalendarEvent[]>(() => {
    const q = searchQuery.toLowerCase();
    return displayableCalendarEvents.filter(
      (event) =>
        !searchQuery.trim() ||
        (event.kind === 'appointment' && (event.patientName ?? '').toLowerCase().includes(q)),
    );
  }, [displayableCalendarEvents, searchQuery]);

  // KPI modal: predicate map + filtered items.
  // firstVisitInPeriod / repeatVisitInPeriod use the id-set returned by the API
  // (kpis.firstVisitIds) so the modal shows exactly the same appointments as the
  // tile counter — matching the SQL NOT EXISTS logic that looks across ALL time,
  // not just the visible feed window.
  const kpiModalItems = useMemo<CalendarAppointmentEvent[]>(() => {
    if (!kpiModalFilter) return [];

    const firstVisitIdSet = new Set<string>(kpis?.firstVisitIds ?? []);

    const KPI_PREDICATES: Partial<
      Record<keyof ScheduleKpis, (e: CalendarAppointmentEvent) => boolean>
    > = {
      cancellationsInPeriod: (e) => isCancelledAppointmentStatus(e.status),
      firstVisitInPeriod: (e) => firstVisitIdSet.has(e.id),
      repeatVisitInPeriod: (e) =>
        !isCancelledAppointmentStatus(e.status) && !firstVisitIdSet.has(e.id),
      bySubscriptionInPeriod: (e) => Boolean(e.packageUsageRef || e.packageTitle),
      pastInPeriod: (e) => parseFeedInstant(e.startAt, currentTimeZone) < DateTime.now(),
      futureInPeriod: (e) => parseFeedInstant(e.startAt, currentTimeZone) >= DateTime.now(),
      uniquePatientsInPeriod: (_e) => true,
      recordsInPeriod: (_e) => true,
      reschedulesInPeriod: (e) => !isCancelledAppointmentStatus(e.status) && e.rescheduleCount > 0,
    };

    const pred = KPI_PREDICATES[kpiModalFilter];
    if (!pred) return [];
    return (data?.events ?? []).filter(
      (e): e is CalendarAppointmentEvent => e.kind === 'appointment' && pred(e),
    );
  }, [kpiModalFilter, data?.events, currentTimeZone, kpis?.firstVisitIds]);

  const kpiModalTitle = kpiModalFilter
    ? (KPI_ITEMS.find((k) => k.key === kpiModalFilter)?.label ?? '')
    : '';
  const eventPanelOpen = selected !== null || showCreatePanel;
  const eventPanelTitle = selected ? 'Детали записи' : 'Новая запись';
  const eventPanelNode = eventPanelOpen ? (
    <DoctorCalendarEventPanel
      key={selected?.id ?? 'create'}
      apiBase={API_BASE}
      selected={selected}
      timeZone={currentTimeZone}
      filterMeta={filters}
      activeFilters={activeFilters}
      ownSpecialistId={scopeBootstrap.ownSpecialistId}
      showCloseControl={false}
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
    />
  ) : null;
  const handleKpiClick = (key: ScheduleKpiNumberKey) => {
    setFiltersPanelOpen(false);
    setKpiModalFilter((previous) => (previous === key ? null : key));
  };
  const toggleFiltersPanel = () => {
    if (filtersPanelOpen) {
      setFiltersPanelOpen(false);
      return;
    }
    if (eventPanelOpen && !closeDraftOrSelectionFromGrid()) return;
    setKpiModalFilter(null);
    setFiltersPanelOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 md:gap-4">
      {/* Toolbar (D1) — full width. R30: прилипает 2-м рядом под per-page-шапкой
          (комбинируем базовый sticky-класс с top-офсетом, как эталон exercises). */}
      <div
        className={cn(
          DOCTOR_CATALOG_STICKY_BAR_CLASS,
          DOCTOR_REMAINING_HEIGHT_TOOLBAR_TOP_CLASS,
          DOCTOR_TRANSLUCENT_TOOLBAR_SURFACE_CLASS,
          'flex flex-wrap items-center gap-2',
        )}
        data-testid="cal-toolbar"
      >
        <div className="flex w-full min-w-0 items-center gap-1 md:hidden">
          <Button
            type="button"
            size="icon"
            variant="default"
            className="size-[32px] shrink-0"
            aria-label={view === 'month' ? 'Показать три дня' : 'Показать месяц'}
            title={view === 'month' ? 'Три дня' : 'Месяц'}
            onClick={() => {
              setFiltersPanelOpen(false);
              updateMobileVisibleDate(mobileVisibleDateRef.current, true);
              mobileScrollRestoreDateRef.current = mobileVisibleDateRef.current;
              mobileScrollPositionedRangeRef.current = null;
              if (view === 'day') {
                setDrillBackView(null);
                onDeepLinkChange('from', null);
              }
              setView(view === 'month' ? '3days' : 'month');
            }}
          >
            {view === 'month' ? (
              <CalendarDays className="size-4" aria-hidden />
            ) : (
              <Columns3 className="size-4" aria-hidden />
            )}
          </Button>

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

          <Button
            ref={mobilePeriodButtonRef}
            type="button"
            variant="outline"
            size="sm"
            className={cn(
              INACTIVE_TOOLBAR_BUTTON_CLASS,
              'h-8 min-w-0 flex-1 truncate px-2 text-center text-xs font-medium text-foreground',
            )}
            onClick={() => {
              setFiltersPanelOpen(false);
              updateMobileVisibleDate(mobileVisibleDateRef.current, true);
              setDatePickerOpen(true);
            }}
            aria-label="Перейти к дате"
          >
            {mobilePeriodLabel(mobileVisibleDate, currentTimeZone)}
          </Button>

          <div
            className="ml-auto flex shrink-0 items-center gap-1"
            role="group"
            aria-label="Вид календаря"
          >
            <Button
              type="button"
              size="icon"
              variant={renderMode === 'calendar' ? 'default' : 'outline'}
              className={cn(
                'size-[32px]',
                renderMode !== 'calendar' && INACTIVE_TOOLBAR_BUTTON_CLASS,
              )}
              aria-label="Календарь"
              onClick={() => {
                setFiltersPanelOpen(false);
                setRenderMode('calendar');
              }}
            >
              <Calendar className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={renderMode === 'list' ? 'default' : 'outline'}
              className={cn('size-[32px]', renderMode !== 'list' && INACTIVE_TOOLBAR_BUTTON_CLASS)}
              aria-label="Список"
              onClick={() => {
                setFiltersPanelOpen(false);
                setRenderMode('list');
              }}
            >
              <List className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={filtersPanelOpen ? 'default' : 'outline'}
              className={cn('size-[32px]', !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS)}
              onClick={toggleFiltersPanel}
              aria-label="Фильтры"
              aria-expanded={filtersPanelOpen}
              aria-controls="schedule-filters-panel"
            >
              <Filter className="size-4" aria-hidden />
            </Button>
          </div>
        </div>

        <div className="hidden w-full flex-wrap items-center gap-2 md:flex">
          {/* View switcher: 3 дня · Неделя · Месяц (без «Лента» и без «День») */}
          <div className="flex gap-1" role="group" aria-label="Режим отображения">
            {(
              [
                { v: '3days' as const, label: '3 дня' },
                { v: 'weekgrid' as const, label: 'Неделя' },
                { v: 'month' as const, label: 'Месяц' },
              ] as const
            ).map(({ v, label }) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={view === v ? 'default' : 'outline'}
                className={view === v ? undefined : INACTIVE_TOOLBAR_BUTTON_CLASS}
                onClick={() => {
                  setFiltersPanelOpen(false);
                  // При переключении из day (drill-down) — выходим из drill-down
                  if (view === 'day') {
                    setDrillBackView(null);
                    onDeepLinkChange('from', null);
                  }
                  setView(v);
                }}
                data-testid={`view-btn-${v}`}
              >
                {label}
              </Button>
            ))}
          </div>

          {/* Drill-down «День»: показываем если сейчас day */}
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

          {/* Calendar/List toggle — compact icon pair */}
          <div className="flex gap-1" role="group" aria-label="Вид отображения">
            <Button
              type="button"
              size="icon"
              variant={renderMode === 'calendar' ? 'default' : 'outline'}
              className={cn(
                'size-[32px] shrink-0',
                renderMode !== 'calendar' && INACTIVE_TOOLBAR_BUTTON_CLASS,
              )}
              aria-label="Календарь"
              title="Календарь"
              onClick={() => {
                setFiltersPanelOpen(false);
                setRenderMode('calendar');
              }}
              data-testid="render-btn-calendar"
            >
              <Calendar className="size-4" aria-hidden />
            </Button>
            <Button
              type="button"
              size="icon"
              variant={renderMode === 'list' ? 'default' : 'outline'}
              className={cn(
                'size-[32px] shrink-0',
                renderMode !== 'list' && INACTIVE_TOOLBAR_BUTTON_CLASS,
              )}
              aria-label="Список"
              title="Список"
              onClick={() => {
                setFiltersPanelOpen(false);
                setRenderMode('list');
              }}
              data-testid="render-btn-list"
            >
              <List className="size-4" aria-hidden />
            </Button>
          </div>

          {/* Search bar (list mode) */}
          {renderMode === 'list' ? (
            <div className="relative flex-1 min-w-[8rem] max-w-xs">
              <Search
                className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
                aria-hidden
              />
              <Input
                type="search"
                placeholder="Поиск записей…"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 text-sm h-8"
                aria-label="Поиск записей"
              />
            </div>
          ) : null}

          {/* найдено N counter when searching */}
          {renderMode === 'list' && searchQuery.trim() ? (
            <span className="text-xs text-muted-foreground" data-testid="search-count">
              найдено {visibleEvents.filter((e) => e.kind === 'appointment').length}
            </span>
          ) : null}

          {/* «Сегодня» — вернуть текущий вид к сегодняшнему периоду */}
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

          {/* Period nav: ◀ label ▶ */}
          <>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={INACTIVE_TOOLBAR_BUTTON_CLASS}
              onClick={() => {
                setFiltersPanelOpen(false);
                shiftAnchor(-1);
              }}
              aria-label="Предыдущий период"
              data-testid="period-prev"
            >
              ◀
            </Button>
            <span
              className="text-sm font-medium text-foreground px-1 min-w-[8rem] text-center"
              data-testid="period-label"
            >
              {periodLabel(view, anchorDate, currentTimeZone)}
            </span>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className={INACTIVE_TOOLBAR_BUTTON_CLASS}
              onClick={() => {
                setFiltersPanelOpen(false);
                shiftAnchor(1);
              }}
              aria-label="Следующий период"
              data-testid="period-next"
            >
              ▶
            </Button>
          </>

          <Button
            type="button"
            size="sm"
            variant={filtersPanelOpen ? 'default' : 'outline'}
            className={cn(
              'ml-auto gap-2 xl:hidden',
              !filtersPanelOpen && INACTIVE_TOOLBAR_BUTTON_CLASS,
            )}
            onClick={toggleFiltersPanel}
            aria-expanded={filtersPanelOpen}
            aria-controls="schedule-filters-panel"
          >
            <Filter className="size-4" aria-hidden />
            Фильтры
          </Button>
        </div>
      </div>

      {renderMode === 'list' ? (
        <div className="relative md:hidden">
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
      ) : null}

      {/* Error */}
      {error ? (
        <p className="text-sm text-destructive" data-testid="cal-error">
          {error}
        </p>
      ) : null}

      {/* Main content row: calendar/list + aside panel */}
      <div
        className={cn(
          'block min-h-0 flex-1 pb-0 xl:grid xl:grid-cols-[minmax(0,7fr)_minmax(18rem,3fr)] xl:items-start xl:gap-4',
          renderMode === 'calendar' &&
            'flex min-h-0 flex-1 pb-0 xl:items-stretch',
          renderMode === 'list' && 'xl:min-h-0 xl:overflow-hidden xl:pb-0',
        )}
      >
        {/* Content area */}
        <div
          className={cn(
            'min-h-0 min-w-0 flex-1',
            renderMode === 'calendar' && 'h-full md:min-h-0',
            renderMode === 'list' && 'h-full min-h-0',
          )}
        >
          {renderMode === 'list' ? (
            // List view — period-bound, grouped by day
            <ListView
              events={visibleEvents}
              anchorDate={anchorDate}
              timeZone={currentTimeZone}
              rangeFrom={listRange.from}
              rangeTo={listRange.to}
              onSelect={(appt) => {
                setFiltersPanelOpen(false);
                setSelected(appt);
                setShowCreatePanel(false);
                onDeepLinkChange('appt', appt.id);
              }}
            />
          ) : (
            // FullCalendar
            <div className="relative -mx-3 h-full min-h-0 md:mx-0">
              <div
                ref={calendarViewportRef}
                className={cn(
                  'relative h-full min-h-0 flex-1 touch-pan-y overscroll-contain border-0 bg-card pb-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:w-full md:rounded-xl md:border md:border-border',
                  mobileScrollableMonthGrid
                    ? 'w-full overflow-x-hidden overflow-y-auto'
                    : 'w-full overflow-hidden',
                )}
                data-mobile-calendar-viewport=""
                onScroll={(event) => {
                  handleMobileCalendarScroll(event.currentTarget);
                }}
                onPointerDownCapture={() => {
                  if (calendarFilterOpenRef.current) {
                    suppressCalendarInteractionUntilRef.current = Date.now() + 1000;
                  }
                }}
              >
                {mobileScrollableMonthGrid ? (
                  <MobileScrollableMonthCalendar
                    rangeStart={mobileMonthCalendarRange.start}
                    rangeEnd={mobileMonthCalendarRange.end}
                    timeZone={currentTimeZone}
                    events={calendarEvents}
                    onDateClick={drillDownDay}
                    onAppointmentClick={openAppointmentDetails}
                  />
                ) : (
                  <>
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
                .fc-event .fc-event-main { color: var(--foreground) !important; }
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

                /* Красный круг вокруг сегодняшней даты во всех режимах. */
                .fc-today-circle {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  min-width: 2.05rem;
                  min-height: 2.05rem;
                  padding: 0.2rem 0.2rem;
                  border-radius: 9999px;
                  background-color: rgba(219, 113, 93, 0.85);
                  color: white;
                  font-weight: 600;
                }
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
                .fc-timegrid-header-link.fc-today-circle {
                  gap: 0.1rem;
                  margin-inline: auto;
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
                .fc-timegrid-header-link.fc-today-circle .fc-timegrid-header-weekday,
                .fc-timegrid-header-link.fc-today-circle .fc-timegrid-header-day {
                  color: inherit;
                }

                /* §3.11 — мельче цифры дат в месячном виде */
                .fc-daygrid-day-number {
                  font-size: 0.6875rem !important;
                  font-weight: 400 !important;
                  line-height: 1.5 !important;
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
                        editable={view !== 'month'}
                        eventDurationEditable={view !== 'month'}
                        eventStartEditable={view !== 'month'}
                        // R32: выделение области создаёт запись; клик (без движения) не выделяет,
                        // чтобы остаться сбросом выбора (R24). selectMinDistance разводит клик и drag.
                        selectable={view !== 'month'}
                        selectMirror
                        selectMinDistance={5}
                        // #225: keep FC visual slot selection while the create panel is open.
                        // Default unselectAuto=true clears the blue drag highlight on click-elsewhere,
                        // making it look like the slot choice was lost even though the form is prefilled.
                        unselectAuto={false}
                        select={onSelect}
                        nowIndicator
                        dayMaxEvents
                        allDaySlot={false}
                        height="100%"
                        datesSet={handleMobileCalendarDatesSet}
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
                    DateTime.fromJSDate(date).setZone(currentTimeZone).toISODate() ?? anchorDate;
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
                                      isToday && 'fc-today-circle',
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
                          dt.toISODate() === DateTime.now().setZone(currentTimeZone).toISODate();
                                return (
                                  <Button
                                    type="button"
                                    variant="ghost"
                            className={cn('fc-timegrid-header-link', isToday && 'fc-today-circle')}
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
                          openCreateDraft(arg.date, null);
                        }}
                        eventDrop={onDrop}
                        eventResize={onResize}
                        eventContent={(info) => {
                          const appointment = info.event.extendedProps?.appointment as
                            CalendarAppointmentEvent | undefined;
                          if (appointment) {
                            if (view === 'month') {
                              // Плашка = строка, только фамилия
                              return (
                                <div className="truncate px-1 text-[11px] leading-tight">
                                  {eventLastName(appointment)}
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
                  return <div className="truncate px-1 py-0.5 text-[11px]">{info.event.title}</div>;
                        }}
                      />
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <aside className="hidden h-full min-h-0 w-full space-y-3 overflow-y-auto xl:block">
          <section className={doctorSectionCardClass}>
            <h2 className={doctorSectionTitleClass}>Фильтры</h2>
            {renderScheduleFilters('flex flex-col gap-2', 'w-full')}
          </section>
          {showKpi ? (
            <KpiRowTab kpis={kpis} kpisLoading={kpisLoading} onKpiClick={handleKpiClick} />
          ) : null}
        </aside>
      </div>

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
          className="mx-auto p-3"
          style={{ ['--rdp-accent-color' as string]: 'var(--primary)' }}
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
          {renderScheduleFilters('flex flex-col gap-2', 'w-full')}
          {showKpi ? (
            <KpiRowTab kpis={kpis} kpisLoading={kpisLoading} onKpiClick={handleKpiClick} />
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
          size="content"
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

      <KpiPreviewModal
        open={kpiModalFilter !== null}
        onClose={() => setKpiModalFilter(null)}
        title={kpiModalTitle}
        count={kpiModalItems.length}
        items={kpiModalItems}
        renderItem={(item) => {
          const dt = parseFeedInstant(item.startAt, currentTimeZone);
          // Match the «Сегодня» etalon row format: «HH:mm DD.MM».
          const timeLabel = dt.toFormat('HH:mm dd.MM');
          return (
            <AppointmentKpiItem
              item={{
                clientLabel: item.patientName ?? 'Запись',
                time: timeLabel,
                typeLabel: item.serviceTitle ?? null,
                statusLabel: appointmentStatusLabel(item.status),
                branchName: item.branchTitle ?? null,
                altNameNote: null,
                cancelled: isCancelledAppointmentStatus(item.status),
                href: item.platformUserId
                  ? routePaths.doctorPatientCard(item.platformUserId)
                  : null,
                ctaLabel: item.platformUserId ? 'Открыть карточку' : null,
              }}
            />
          );
        }}
      />
    </div>
  );
}
