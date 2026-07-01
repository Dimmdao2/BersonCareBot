"use client";

import Link from "next/link";
import { DateTime } from "luxon";
import FullCalendar from "@fullcalendar/react";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import ruLocale from "@fullcalendar/core/locales/ru";
import { DoctorSection, DoctorSectionTitle } from "@/shared/ui/doctor/DoctorSection";
import { doctorSectionSubtitleClass, doctorInlineLinkClass } from "@/shared/ui/doctor/doctorVisual";
import type { TodayAppointmentItem } from "./loadDoctorTodayDashboard";
import type { CalendarAppointmentEvent } from "@/modules/booking-calendar/types";
import { isCancelledAppointmentStatus } from "@/modules/booking-calendar/appointmentStatusLabels";

/** Конвертирует минуты от полуночи в строку "HH:MM:SS" для slotMinTime/slotMaxTime. */
function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

const DEFAULT_SLOT_MIN = "09:00:00";
const DEFAULT_SLOT_MAX = "19:00:00";

/** Maps a canonical CalendarAppointmentEvent to a display class matching the schedule calendar. */
function canonicalEventClass(appt: CalendarAppointmentEvent): string {
  if (isCancelledAppointmentStatus(appt.status))
    return "!bg-destructive/15 text-destructive/80 !border-destructive/20 line-through";
  if (appt.status === "awaiting_payment" || appt.prepaymentPending)
    return "!bg-amber-500/15 text-amber-900 !border-amber-500/40";
  if (appt.packageUsageRef || appt.packageTitle)
    return "!bg-violet-500/15 text-violet-900 !border-violet-500/40";
  return "!bg-primary/15 text-foreground !border-primary/35";
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
  displayIana,
  workingBounds,
  onCanonicalEventClick,
  onEventClick,
}: Props) {
  // Сегодня в бизнес-таймзоне
  const todayIso =
    DateTime.now().setZone(displayIana).toISODate() ??
    new Date().toISOString().slice(0, 10);

  // #7: слот мин/макс = рабочие границы ± 1 ч, расширяем до крайних записей за пределами рабочего.
  const { slotMinTime, slotMaxTime, slotLoMinute, slotHiMinute } = (() => {
    // Collect appointment edge minutes from calendarEvents (canonical) or legacy list.
    let earliestApptMin: number | null = null;
    let latestApptMin: number | null = null;
    if (calendarEvents && calendarEvents.length > 0) {
      for (const ev of calendarEvents) {
        const s = DateTime.fromISO(ev.startAt, { zone: displayIana });
        const e = DateTime.fromISO(ev.endAt, { zone: displayIana });
        if (s.isValid) {
          const sm = s.hour * 60 + s.minute;
          earliestApptMin = earliestApptMin == null ? sm : Math.min(earliestApptMin, sm);
        }
        if (e.isValid) {
          const em = e.hour * 60 + e.minute;
          latestApptMin = latestApptMin == null ? em : Math.max(latestApptMin, em);
        }
      }
    }
    if (workingBounds != null) {
      const workStart = workingBounds.startMinute;
      const workEnd = workingBounds.endMinute;
      // #7: visible = [min(workStart-1h, earliestAppt), max(workEnd+1h, latestAppt)]
      const lo = Math.max(0, Math.min(workStart - 60, earliestApptMin ?? workStart - 60));
      const hi = Math.min(24 * 60, Math.max(workEnd + 60, latestApptMin ?? workEnd + 60));
      return {
        slotMinTime: minuteToHHMM(lo),
        slotMaxTime: minuteToHHMM(hi),
        slotLoMinute: lo,
        slotHiMinute: hi,
      };
    }
    const loMin = 9 * 60; // 09:00 default
    const hiMin = 19 * 60; // 19:00 default
    return { slotMinTime: DEFAULT_SLOT_MIN, slotMaxTime: DEFAULT_SLOT_MAX, slotLoMinute: loMin, slotHiMinute: hiMin };
  })();

  // #6: if today has NO schedule (workingBounds === null, explicitly closed/no data),
  // paint the whole visible column grey. When workingBounds is undefined (not yet known)
  // we leave the calendar white — same as before.
  const bgFillEvent = workingBounds === null
    ? [{
        id: "nonwork:today:all",
        start: `${todayIso}T${minuteToHHMM(slotLoMinute)}`,
        end: `${todayIso}T${minuteToHHMM(slotHiMinute)}`,
        display: "background" as const,
        classNames: ["!bg-[#eeeeee]", "!opacity-60"],
      }]
    : [];

  // Build FullCalendar events.
  // Priority: canonical events (calendarEvents prop) > legacy TodayAppointmentItem list.
  // Canonical events have be_appointments.id which is what DoctorCalendarEventPanel expects.
  const fcAppointmentEvents = (() => {
    if (calendarEvents && calendarEvents.length > 0) {
      // Map CalendarAppointmentEvent → FC event (same pattern as ScheduleCalendarTab)
      return calendarEvents.map((appt) => ({
        id: appt.id,
        title: appt.patientName ?? "Запись",
        start: appt.startAt,
        end: appt.endAt,
        classNames: [canonicalEventClass(appt)],
        extendedProps: { canonicalAppt: appt },
      }));
    }
    // Fallback: map legacy TodayAppointmentItem list (used while calendarEvents loads)
    return appointments.map((appt) => {
      let startDt: DateTime;
      if (appt.recordAtIso) {
        startDt = DateTime.fromISO(appt.recordAtIso, { zone: "utc" });
      } else {
        const timeOnly = appt.time.slice(0, 5);
        startDt = DateTime.fromISO(`${todayIso}T${timeOnly}`, { zone: displayIana });
      }
      const start = startDt.isValid ? startDt.toISO() : undefined;
      const end = startDt.isValid ? startDt.plus({ minutes: 60 }).toISO() ?? undefined : undefined;
      return {
        id: appt.id,
        title: appt.clientLabel,
        start: start ?? undefined,
        end: end ?? undefined,
        classNames: ["!bg-primary/15 text-foreground !border-primary/35"],
        extendedProps: { href: appt.href, appt },
      };
    });
  })();

  const fcEvents = [...bgFillEvent, ...fcAppointmentEvents];

  return (
    <DoctorSection id="doctor-today-mini-calendar">
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Расписание на сегодня</DoctorSectionTitle>
        <span className={doctorSectionSubtitleClass}>{todayDateLabel}</span>
      </div>

      {/* R1: empty-state hint + link to schedule; the FC day stays visible regardless */}
      {appointments.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Записей на сегодня нет —{" "}
          <Link href="/app/doctor/schedule?tab=calendar" className={doctorInlineLinkClass}>
            открыть расписание
          </Link>
        </p>
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
