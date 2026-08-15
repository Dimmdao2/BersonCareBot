'use client';

import Link from 'next/link';
import { DateTime } from 'luxon';
import FullCalendar from '@fullcalendar/react';
import timeGridPlugin from '@fullcalendar/timegrid';
import interactionPlugin from '@fullcalendar/interaction';
import luxonPlugin from '@fullcalendar/luxon3';
import ruLocale from '@fullcalendar/core/locales/ru';
import { DoctorSection, DoctorSectionTitle } from '@/shared/ui/doctor/DoctorSection';
import { buttonVariants } from '@/shared/ui/doctor/primitives/button';
import type { TodayAppointmentItem } from './loadDoctorTodayDashboard';
import type { CalendarAppointmentEvent } from '@/modules/booking-calendar/types';
import { isCancelledAppointmentStatus } from '@/modules/booking-calendar/appointmentStatusLabels';
import { formatPatientPackageShortLabel } from '@/modules/memberships/display';
import {
  DEFAULT_CALENDAR_WINDOW_MAX,
  DEFAULT_CALENDAR_WINDOW_MIN,
  deriveCalendarVisibleTimeWindow,
  type CalendarVisibleWindowEvent,
} from '@/modules/booking-calendar/visibleTimeWindow';

/** Конвертирует минуты от полуночи в строку "HH:MM:SS" для slotMinTime/slotMaxTime. */
function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
}

/** Maps a canonical CalendarAppointmentEvent to a display class matching the schedule calendar. */
function canonicalEventClass(appt: CalendarAppointmentEvent): string {
  if (isCancelledAppointmentStatus(appt.status))
    return '!bg-destructive/15 text-destructive/80 !border-destructive/20 line-through';
  if (appt.status === 'awaiting_payment' || appt.prepaymentPending)
    return '!bg-amber-500/15 text-amber-900 !border-amber-500/40';
  if (appt.packageUsageRef || appt.packageTitle)
    return '!bg-violet-500/15 text-violet-900 !border-violet-500/40';
  if (appt.branchColor) return 'text-foreground';
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

function canonicalBranchColors(appt: CalendarAppointmentEvent): {
  backgroundColor?: string;
  borderColor?: string;
} {
  if (
    !appt.branchColor ||
    isCancelledAppointmentStatus(appt.status) ||
    appt.status === 'awaiting_payment' ||
    appt.prepaymentPending ||
    appt.packageUsageRef ||
    appt.packageTitle
  ) {
    return {};
  }
  const backgroundColor = rgba(appt.branchColor, 0.16);
  const borderColor = rgba(appt.branchColor, 0.42);
  if (!backgroundColor || !borderColor) return {};
  return { backgroundColor, borderColor };
}

function canonicalEventTitle(appt: CalendarAppointmentEvent): string {
  const prefix =
    appt.packageUsageRef || appt.packageTitle
      ? `${formatPatientPackageShortLabel(appt.packageDisplayNumber)} `
      : '';
  return `${prefix}${appt.patientName ?? 'Запись'}`;
}

type Props = {
  /** Server-rendered list — used for sr-only accessibility and empty-state detection. */
  appointments: TodayAppointmentItem[];
  /**
   * Canonical calendar events fetched client-side from /api/doctor/booking-engine/calendar.
   * When provided, these are used for FullCalendar rendering (instead of the legacy list).
   * Using canonical events ensures the IDs match what DoctorCalendarEventPanel expects.
   */
  calendarEvents?: CalendarAppointmentEvent[];
  /**
   * Минуты с полуночи (больше не используются — FC рисует линию "сейчас" сам).
   * Проп оставлен для обратной совместимости с вызывающим кодом.
   */
  nowMinutes?: number;
  /** Подпись даты, напр. «ср, 11 июня». */
  todayDateLabel: string;
  /** Server-derived local calendar date for the initial dashboard snapshot. */
  todayIso: string;
  /** IANA-таймзона для корректного маппинга записей на временную ось. */
  displayIana: string;
  /**
   * Рабочие границы дня в минутах от полуночи (§1.2, S4).
   * Вычисляются на сервере через deriveWorkingBounds; `null` = день закрыт/нет данных.
   */
  workingBounds?: { startMinute: number; endMinute: number } | null;
  /**
   * Called when a canonical CalendarAppointmentEvent is clicked.
   * Use this (not onEventClick) when calendarEvents are provided — it passes the full
   * event object so the modal can display it directly without re-fetching.
   */
  onCanonicalEventClick?: (appt: CalendarAppointmentEvent) => void;
  /**
   * Legacy callback for clicking a TodayAppointmentItem (used when calendarEvents is not set).
   * @deprecated Prefer onCanonicalEventClick + calendarEvents.
   */
  onEventClick?: (appt: TodayAppointmentItem) => void;
};

export function DoctorTodayMiniCalendar({
  appointments,
  calendarEvents,
  todayDateLabel,
  todayIso,
  displayIana,
  workingBounds,
  onCanonicalEventClick,
  onEventClick,
}: Props) {
  // #538/#231: слот мин/макс = дефолт 09:00–19:00, который только расширяется
  // наружу по рабочим границам и записям. Не сжимаем «Сегодня» до 14–17.
  const { slotMinTime, slotMaxTime, slotLoMinute, slotHiMinute } = (() => {
    const visibleEvents: CalendarVisibleWindowEvent[] =
      calendarEvents && calendarEvents.length > 0
        ? calendarEvents
        : appointments.map((appt) => {
            const startAt = appt.recordAtIso ?? `${todayIso}T${appt.time.slice(0, 5)}:00`;
            return {
              kind: 'appointment',
              startAt,
              endAt:
                DateTime.fromISO(startAt, { zone: appt.recordAtIso ? 'utc' : displayIana })
                  .plus({ minutes: 60 })
                  .toISO() ?? startAt,
            };
          });
    // `workingBounds` are the exact wall-clock bounds from deriveWorkingBounds.
    // Keep them exact here: the shared visible-window helper already owns the
    // one-hour appointment buffer. Pre-padding both inputs made the Today grid
    // start two hours before the first appointment in an early-shift case.
    const bounds =
      workingBounds == null
        ? null
        : {
            minMinute: workingBounds.startMinute,
            maxMinute: workingBounds.endMinute,
          };
    const result = deriveCalendarVisibleTimeWindow(bounds, visibleEvents, displayIana, {
      startMinute: DEFAULT_CALENDAR_WINDOW_MIN,
      endMinute: DEFAULT_CALENDAR_WINDOW_MAX,
    });
    return {
      slotMinTime: result.slotMinTime,
      slotMaxTime: result.slotMaxTime,
      slotLoMinute: result.loMinute,
      slotHiMinute: result.hiMinute,
    };
  })();

  // #6: if today has NO schedule (workingBounds === null, explicitly closed/no data),
  // paint the whole visible column grey. When workingBounds is undefined (not yet known)
  // we leave the calendar white — same as before.
  const bgFillEvent =
    workingBounds === null
      ? [
          {
            id: 'nonwork:today:all',
            start: `${todayIso}T${minuteToHHMM(slotLoMinute)}`,
            end: `${todayIso}T${minuteToHHMM(slotHiMinute)}`,
            display: 'background' as const,
            classNames: ['!bg-[#eeeeee]', '!opacity-60'],
          },
        ]
      : [];

  // Build FullCalendar events.
  // Priority: canonical events (calendarEvents prop) > legacy TodayAppointmentItem list.
  // Canonical events have be_appointments.id which is what DoctorCalendarEventPanel expects.
  const fcAppointmentEvents = (() => {
    if (calendarEvents && calendarEvents.length > 0) {
      // Map CalendarAppointmentEvent → FC event (same pattern as ScheduleCalendarTab)
      return calendarEvents.map((appt) => ({
        id: appt.id,
        title: canonicalEventTitle(appt),
        start: appt.startAt,
        end: appt.endAt,
        classNames: [canonicalEventClass(appt)],
        ...canonicalBranchColors(appt),
        extendedProps: { canonicalAppt: appt },
      }));
    }
    // Fallback: map legacy TodayAppointmentItem list (used while calendarEvents loads)
    return appointments.map((appt) => {
      let startDt: DateTime;
      if (appt.recordAtIso) {
        startDt = DateTime.fromISO(appt.recordAtIso, { zone: 'utc' });
      } else {
        const timeOnly = appt.time.slice(0, 5);
        startDt = DateTime.fromISO(`${todayIso}T${timeOnly}`, { zone: displayIana });
      }
      const start = startDt.isValid ? startDt.toISO() : undefined;
      const end = startDt.isValid
        ? (startDt.plus({ minutes: 60 }).toISO() ?? undefined)
        : undefined;
      return {
        id: appt.id,
        title: appt.clientLabel,
        start: start ?? undefined,
        end: end ?? undefined,
        classNames: ['!bg-primary/15 text-foreground !border-primary/35'],
        extendedProps: { href: appt.href, appt },
      };
    });
  })();

  const fcEvents = [...bgFillEvent, ...fcAppointmentEvents];

  return (
    <DoctorSection id="doctor-today-mini-calendar">
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>{todayDateLabel}</DoctorSectionTitle>
        <Link href="/app/doctor/schedule?tab=calendar" className={buttonVariants({ size: 'sm' })}>
          Открыть расписание
        </Link>
      </div>

      {/* R1: empty-state hint; the FC day and header action stay visible regardless. */}
      {appointments.length === 0 ? (
        <p className="text-xs text-muted-foreground">Записей на сегодня нет</p>
      ) : null}

      {/* sr-only список записей — для скринридеров и тестов (FC не рендерит события в jsdom) */}
      {appointments.length > 0 ? (
        <ul className="sr-only" aria-label="Записи на сегодня">
          {appointments.map((appt) => (
            <li key={appt.id}>
              <a href={appt.href}>{appt.clientLabel}</a>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="overflow-hidden rounded-lg border border-border">
        <style>{`
          /* CAL-P1: kill green flash on first paint (same fix as ScheduleCalendarTab). */
          #doctor-today-mini-calendar .fc {
            --fc-bg-event-color: transparent;
          }
          /* Текст событий — тёмный (FC форсит белый через --fc-event-text-color) */
          #doctor-today-mini-calendar .fc-event:not(.fc-bg-event) {
            box-shadow: none !important;
            cursor: pointer !important;
            --fc-event-text-color: var(--foreground) !important;
          }
          #doctor-today-mini-calendar .fc-event .fc-event-main {
            color: var(--foreground) !important;
          }
          #doctor-today-mini-calendar .fc-event.fc-event-past { opacity: 0.6; }
          #doctor-today-mini-calendar .fc-timegrid-event-harness { margin-inline: 1px; }
          /* Убрать желтую заливку "сегодня" */
          #doctor-today-mini-calendar .fc .fc-day-today {
            --fc-today-bg-color: transparent !important;
            background-color: transparent !important;
          }
          /* Типографика меток времени */
          #doctor-today-mini-calendar .fc-timegrid-slot-label-cushion {
            font-size: 0.625rem !important;
            color: var(--muted-foreground) !important;
          }
        `}</style>
        <FullCalendar
          plugins={[timeGridPlugin, interactionPlugin, luxonPlugin]}
          locale={ruLocale}
          initialView="timeGridDay"
          initialDate={todayIso}
          headerToolbar={false}
          dayHeaders={false}
          allDaySlot={false}
          nowIndicator
          height="auto"
          timeZone={displayIana}
          slotMinTime={slotMinTime}
          slotMaxTime={slotMaxTime}
          events={fcEvents}
          eventClick={(info) => {
            // Prefer canonical event (has be_appointments.id, works with DoctorCalendarEventPanel).
            const canonicalAppt = info.event.extendedProps?.canonicalAppt as
              | CalendarAppointmentEvent
              | undefined;
            if (onCanonicalEventClick && canonicalAppt) {
              onCanonicalEventClick(canonicalAppt);
              return;
            }
            // Legacy fallback (used while calendarEvents hasn't loaded yet).
            const appt = info.event.extendedProps?.appt as TodayAppointmentItem | undefined;
            if (onEventClick && appt) {
              onEventClick(appt);
              return;
            }
            // Last resort: navigate to href.
            const href = info.event.extendedProps?.href as string | undefined;
            if (href) {
              window.location.href = href;
            }
          }}
          eventContent={(info) => (
            <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
              <div className="truncate font-medium">{info.event.title}</div>
            </div>
          )}
        />
      </div>
    </DoctorSection>
  );
}
