import { DateTime } from 'luxon';
import { doctorCalendarAppointmentClassName } from '@/shared/ui/doctor/calendar/doctorCalendarPresentation';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import type { CalendarAppointmentEvent, CalendarEvent } from '@/modules/booking-calendar/types';
import type { MinuteInterval } from '@/modules/booking-scheduling/workingDayBreakEdits';
import type { DoctorScheduleScopeState } from '@/modules/doctor-schedule/scope';
import { errorCodeText } from '@/shared/notifications/errorCodeText';
import { notificationText } from '@/shared/notifications/notificationText';
import { resolveScheduleCalAnchorDate, resolveScheduleCalView, visibleRange } from '../scheduleCalendarRange';
import {
  KPI_FILTER_KEYS,
  SCHEDULE_FILTERS_STORAGE_KEY,
  type CachedScheduleFilters,
  type CalV26View,
  type RenderMode,
  type ScheduleKpiFilterKey,
} from './scheduleCalendarTypes';

export function isScheduleKpiFilterKey(value: string): value is ScheduleKpiFilterKey {
  return KPI_FILTER_KEYS.includes(value as ScheduleKpiFilterKey);
}

export function readCachedScheduleFilters(): CachedScheduleFilters | null {
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

export function writeCachedScheduleFilters(value: CachedScheduleFilters): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(SCHEDULE_FILTERS_STORAGE_KEY, JSON.stringify(value));
  } catch {
    // Private mode or exhausted storage: filters still work for the current page session.
  }
}

/** Stable client load identity — used to absorb SSR bootstrap across Strict Mode remounts. */
export function scheduleCalendarLoadKey(parts: {
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
export function rescheduleErrorLabel(error: string | undefined): string {
  if (error?.startsWith('load_failed')) return notificationText.bookingRescheduleFailed;
  return errorCodeText(error, notificationText.bookingRescheduleFailed);
}

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
export function parseFeedInstant(value: string, zone: string): DateTime {
  const iso = DateTime.fromISO(value, { setZone: true });
  if (iso.isValid) return iso.setZone(zone);
  const sql = DateTime.fromSQL(value, { setZone: true });
  if (sql.isValid) return sql.setZone(zone);
  return DateTime.fromJSDate(new Date(value)).setZone(zone);
}

/** Normalise a raw Postgres timestamptz string to a proper ISO 8601 string
 *  in the doctor's timezone so FullCalendar + luxon3 can parse it reliably. */
export function toFcDate(value: string, zone: string): string {
  const dt = parseFeedInstant(value, zone);
  return dt.isValid ? (dt.toISO() ?? value) : value;
}

/** Clips an event to one local day and expresses it in minutes of that day. */
export function eventDayInterval(
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

// ---------------------------------------------------------------------------
// Helper: period label
// ---------------------------------------------------------------------------

/**
 * Границы видимого периода словами. `monthToken` — формат месяца люксона: `LLLL` (полное имя) для
 * подписи над КПИ, `LLL` (сокращение) для узкой кнопки периода в тулбаре.
 *
 * `to` в модели периода — начало следующего дня, поэтому последний включённый день на сутки раньше.
 */
export function formatPeriodRange(
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
export function periodNavLabel(view: CalV26View, anchorDate: string, zone: string): string {
  return formatPeriodRange(view, anchorDate, zone, 'LLL');
}

/**
 * Подпись кнопки периода в режиме списка — ТОЛЬКО месяц того дня, что сейчас наверху экрана.
 *
 * Владелец 15.09 сначала просил «писать только дату начала отображаемого списка и обновлять её
 * при прокрутке», а затем, посмотрев живьём: «давай в списке показывать только месяц просто - так
 * и обновлять дату при прокрутке дешевле». Число в подписи всё равно читалось как обещание, что
 * лента стоит ровно на нём, — а она стоит там, куда её пустила высота содержимого. Месяц такого
 * обещания не даёт и меняется на два порядка реже: подпись перерисовывается на переходе между
 * месяцами, а не на каждом дне прокрутки.
 */
export function listPeriodNavLabel(dateKey: string, zone: string): string {
  const day = DateTime.fromISO(dateKey, { zone }).setLocale('ru');
  return day.isValid ? capitalizeRussianLabel(day.toFormat('LLLL yyyy')) : '';
}

/**
 * Подпись периода над КПИ-плитками: даты «с — по». Владелец 14.09 смотрел на числа плиток и не мог
 * понять, за что они посчитаны, — в режиме списка на экране месяцы, а считается видимый период.
 *
 * Берётся ИМЕННО `visibleRange` — та же функция, по которой КПИ уходят на сервер (`loadKpis`).
 * Любой другой источник рано или поздно разойдётся со счётом, и подпись начнёт врать. `to` в этой
 * модели — начало следующего дня, поэтому последний включённый день на сутки раньше.
 */
export function kpiPeriodLabel(view: CalV26View, anchorDate: string, zone: string): string {
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

export function capitalizeRussianLabel(label: string): string {
  return label ? `${label[0]?.toLocaleUpperCase('ru')}${label.slice(1)}` : label;
}

// ---------------------------------------------------------------------------
// Helper: resolve view from deep-link
// ---------------------------------------------------------------------------

export const resolveView = resolveScheduleCalView;
export const resolveAnchorDate = resolveScheduleCalAnchorDate;

export function resolveRenderMode(raw: string | undefined): RenderMode {
  if (raw === 'list') return 'list';
  return 'calendar';
}

export function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== '') sp.set(k, v);
  }
  return sp.toString();
}

export function mergeAppointmentPages(...pages: CalendarAppointmentEvent[][]): CalendarAppointmentEvent[] {
  const byId = new Map<string, CalendarAppointmentEvent>();
  for (const item of pages.flat()) byId.set(item.id, item);
  return [...byId.values()].sort((a, b) => a.startAt.localeCompare(b.startAt));
}

// ---------------------------------------------------------------------------
// Helper: event utilities
// ---------------------------------------------------------------------------

export function eventClassName(event: CalendarEvent): string {
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

export function eventTitle(event: CalendarEvent): string {
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
export function eventLastName(event: CalendarEvent): string {
  if (event.kind !== 'appointment') return eventTitle(event);
  const packagePrefix =
    event.packageUsageRef || event.packageTitle
      ? `${formatPatientPackageShortLabel(event.packageDisplayNumber)} `
      : '';
  const name = event.patientName ?? 'Запись';
  return `${packagePrefix}${name.split(' ')[0] ?? name}`;
}
