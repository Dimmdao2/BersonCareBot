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

/** Конвертирует минуты от полуночи в строку "HH:MM:SS" для slotMinTime/slotMaxTime. */
function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

const DEFAULT_SLOT_MIN = "09:00:00";
const DEFAULT_SLOT_MAX = "19:00:00";

type Props = {
  appointments: TodayAppointmentItem[];
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
  /** Если передан — вызывается при клике на событие вместо перехода по href. */
  onEventClick?: (appt: TodayAppointmentItem) => void;
};

export function DoctorTodayMiniCalendar({
  appointments,
  todayDateLabel,
  displayIana,
  workingBounds,
  onEventClick,
}: Props) {
  // slotMinTime/slotMaxTime из рабочих границ (с буфером по 30 мин), иначе дефолт
  const slotMinTime = workingBounds != null
    ? minuteToHHMM(Math.max(0, workingBounds.startMinute - 30))
    : DEFAULT_SLOT_MIN;
  const slotMaxTime = workingBounds != null
    ? minuteToHHMM(Math.min(24 * 60, workingBounds.endMinute + 30))
    : DEFAULT_SLOT_MAX;

  // Сегодня в бизнес-таймзоне
  const todayIso =
    DateTime.now().setZone(displayIana).toISODate() ??
    new Date().toISOString().slice(0, 10);

  // Маппинг TodayAppointmentItem → FullCalendar events
  // appt.time — форматированная метка «ЧЧ:мм ДД.ММ»; используем recordAtIso (UTC ISO)
  // для точного позиционирования. FC с timeZone={displayIana} корректно показывает
  // UTC-момент в нужной таймзоне. Фоллбэк: пробуем parсить appt.time как «HH:MM...».
  const fcEvents = appointments.map((appt) => {
    let startDt: DateTime;
    if (appt.recordAtIso) {
      startDt = DateTime.fromISO(appt.recordAtIso, { zone: "utc" });
    } else {
      // Фоллбэк: берём только «ЧЧ:мм» из строки time (первые 5 символов)
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

  return (
    <DoctorSection id="doctor-today-mini-calendar">
      <div className="flex items-center justify-between gap-2">
        <DoctorSectionTitle>Расписание на сегодня</DoctorSectionTitle>
        <span className={doctorSectionSubtitleClass}>{todayDateLabel}</span>
      </div>

      {/* R1: подсказка «нет записей» + ссылка на расписание, но сам FC-день всегда виден */}
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
          /* Текст событий — тёмный (FC форсит белый через --fc-event-text-color) */
          #doctor-today-mini-calendar .fc-event {
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
            const appt = info.event.extendedProps?.appt as TodayAppointmentItem | undefined;
            if (onEventClick && appt) {
              onEventClick(appt);
            } else {
              const href = info.event.extendedProps?.href as string | undefined;
              if (href) {
                window.location.href = href;
              }
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
