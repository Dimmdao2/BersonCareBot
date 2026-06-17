"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Calendar, List, Search } from "lucide-react";
import { Input } from "@/shared/ui/doctor/primitives/input";
import { Button } from "@/shared/ui/doctor/primitives/button";
import {
  DOCTOR_CATALOG_STICKY_BAR_CLASS,
  DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
} from "@/shared/ui/doctor/doctorWorkspaceLayout";
import {
  doctorMetricValueClass,
  doctorMetricLabelClass,
  doctorStatCardShellClass,
  doctorStatCardInteractiveClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { DoctorCalendarEventPanel } from "../../calendar/DoctorCalendarEventPanel";
import {
  DoctorCalendarRescheduleDialog,
  type PendingReschedule,
} from "../../calendar/DoctorCalendarRescheduleDialog";
import { DoctorCalendarToolbarFilter } from "../../calendar/DoctorCalendarToolbarFilter";
import { resolveCalendarCreateFieldValue } from "@/modules/booking-calendar/calendarCreateFieldMode";
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
} from "@/modules/booking-calendar/appointmentStatusLabels";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import luxonPlugin from "@fullcalendar/luxon3";
import ruLocale from "@fullcalendar/core/locales/ru";
import type { CalendarOptions as FullCalendarOptions } from "@fullcalendar/core";
import type {
  CalendarAppointmentEvent,
  CalendarEvent,
  CalendarFilterMeta,
} from "@/modules/booking-calendar/types";
import type { WorkingBounds } from "@/modules/booking-calendar/types";
import type { ScheduleKpis } from "@/modules/doctor-appointments/ports";
import type { ScheduleTabProps } from "../scheduleTabRegistry";
import { KpiPreviewModal } from "@/shared/ui/doctor/KpiPreviewModal";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "/api/doctor/booking-engine";
const KPIS_API = "/api/doctor/schedule-kpis";
const NEAREST_WINDOW_API = "/api/doctor/schedule/nearest-free-window";

const DEFAULT_SLOT_MIN = "06:00:00";
const DEFAULT_SLOT_MAX = "23:00:00";

// R34: понятные подписи ошибок переноса для диалога подтверждения.
function rescheduleErrorLabel(error: string | undefined): string {
  if (!error) return "Не удалось перенести запись.";
  if (error === "external_slot_taken") return "Время уже занято во внешней записи (Rubitime).";
  if (error === "slot_overlap") return "Слот уже занят другой записью этого специалиста.";
  if (error === "not_found") return "Запись не найдена.";
  if (error === "rubitime_sync_failed") return "Сбой синхронизации с Rubitime.";
  if (error.startsWith("load_failed")) return "Не удалось сохранить перенос. Попробуйте ещё раз.";
  return error;
}

// View types for the v26 calendar tab switcher (3days / weekgrid / month / day(drill-down))
// "feed" removed in batch-1
type CalV26View = "3days" | "weekgrid" | "month" | "day";

// Render mode: calendar (FullCalendar) or list (grouped by day)
type RenderMode = "calendar" | "list";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type CalendarResponse = {
  ok: boolean;
  view: string;
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource?: "canonical";
  showWorkingHours: boolean;
  workingBounds?: WorkingBounds | null;
  error?: string;
};

type NearestWindowResponse = {
  ok: boolean;
  window: { from: string; to: string } | null;
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
// Helper: visibleRange
// ---------------------------------------------------------------------------

/**
 * Вычисляет видимый диапазон для каждого вида.
 * Это единый источник истины для KPI и list-view.
 */
export function visibleRange(
  view: CalV26View,
  anchor: string,
  tz: string,
): { from: string; to: string } {
  const dt = DateTime.fromISO(anchor, { zone: tz });

  if (view === "3days") {
    // Сегодня + 2 дня вперёд
    const from = dt.startOf("day");
    const to = dt.startOf("day").plus({ days: 3 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  if (view === "weekgrid") {
    // Пн–вс
    const from = dt.startOf("week"); // Luxon: пн=1
    const to = dt.endOf("week").startOf("day").plus({ days: 1 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  if (view === "month") {
    // 1-е..последнее (календарный месяц; overflow-дни не входят)
    const from = dt.startOf("month");
    const to = dt.endOf("month").startOf("day").plus({ days: 1 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  // day
  const from = dt.startOf("day");
  const to = dt.startOf("day").plus({ days: 1 });
  return {
    from: from.toISO() ?? anchor,
    to: to.toISO() ?? anchor,
  };
}

// ---------------------------------------------------------------------------
// Helper: period label
// ---------------------------------------------------------------------------

function periodLabel(view: CalV26View, anchorDate: string, zone: string): string {
  const anchor = DateTime.fromISO(anchorDate, { zone });

  if (view === "day") {
    return anchor.setLocale("ru").toFormat("cccc, d LLLL yyyy");
  }
  if (view === "month") {
    return anchor.setLocale("ru").toFormat("LLLL yyyy");
  }
  if (view === "3days") {
    const start = anchor.startOf("day");
    const end = anchor.startOf("day").plus({ days: 2 });
    if (start.month === end.month) {
      return `${start.setLocale("ru").toFormat("d")}–${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
    }
    return `${start.setLocale("ru").toFormat("d LLLL")} – ${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
  }
  if (view === "weekgrid") {
    const start = anchor.startOf("week");
    const end = anchor.endOf("week");
    if (start.month === end.month) {
      return `${start.setLocale("ru").toFormat("d")}–${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
    }
    return `${start.setLocale("ru").toFormat("d LLLL")} – ${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
  }
  return "";
}

// ---------------------------------------------------------------------------
// Helper: resolve view from deep-link
// ---------------------------------------------------------------------------

function resolveView(raw: string | undefined): CalV26View {
  if (
    raw === "3days" ||
    raw === "weekgrid" ||
    raw === "month" ||
    raw === "day"
  )
    return raw;
  return "3days";
}

function resolveRenderMode(raw: string | undefined): RenderMode {
  if (raw === "list") return "list";
  return "calendar";
}

function resolveAnchorDate(raw: string | undefined, timeZone: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return DateTime.now().setZone(timeZone).toISODate() ?? "2026-01-01";
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v != null && v !== "") sp.set(k, v);
  }
  return sp.toString();
}

// ---------------------------------------------------------------------------
// Helper: slot min/max from workingBounds
// ---------------------------------------------------------------------------

function minuteToHHMM(minute: number): string {
  const h = Math.floor(minute / 60);
  const m = minute % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00`;
}

/**
 * Диапазон часовой сетки = объединение рабочих границ И фактических записей,
 * чтобы ранние/поздние приёмы (7-8 утра и т.п.) НЕ обрезались.
 *
 * Логика нижней границы (CAL-01):
 * - Если все записи укладываются в рабочий период, нижняя граница = начало
 *   рабочего периода, выровненное вниз до часа (без дополнительного запаса).
 * - Только если запись начинается ДО рабочего периода, добавляется буфер 30 мин
 *   и округление вниз до часа — чтобы ранняя запись не обрезалась.
 * Верхняя граница: 60 мин запаса + округление вверх до часа.
 * Если нет ни рабочих границ, ни записей — дефолт.
 */
export function deriveSlotTimes(
  workingBounds: WorkingBounds | null | undefined,
  events: CalendarEvent[] | undefined,
  timeZone: string,
): { slotMinTime: string; slotMaxTime: string; loMinute: number; hiMinute: number } {
  const workingFloor: number | null = workingBounds ? workingBounds.minMinute : null;
  let min: number | null = workingFloor;
  let max: number | null = workingBounds ? workingBounds.maxMinute : null;
  for (const e of events ?? []) {
    if (e.kind !== "appointment" && e.kind !== "block") continue;
    const s = parseFeedInstant(e.startAt, timeZone);
    const en = parseFeedInstant(e.endAt, timeZone);
    if (s.isValid) {
      const sm = s.hour * 60 + s.minute;
      min = min == null ? sm : Math.min(min, sm);
    }
    if (en.isValid) {
      let em = en.hour * 60 + en.minute;
      if (em === 0) em = 24 * 60; // полночь конца = конец суток
      max = max == null ? em : Math.max(max, em);
    }
  }
  if (min == null || max == null) {
    return { slotMinTime: DEFAULT_SLOT_MIN, slotMaxTime: DEFAULT_SLOT_MAX, loMinute: 0, hiMinute: 24 * 60 };
  }
  // Нижняя граница: если событие вышло за рабочий период — 30 мин запас + округление вниз;
  // иначе (min == workingFloor или нет рабочих границ) — без запаса, просто округление вниз.
  const hasEarlyEvent = workingFloor != null && min < workingFloor;
  const lo = Math.max(0, hasEarlyEvent ? Math.floor((min - 30) / 60) * 60 : Math.floor(min / 60) * 60);
  const hi = Math.min(24 * 60, Math.ceil((max + 60) / 60) * 60);
  return { slotMinTime: minuteToHHMM(lo), slotMaxTime: minuteToHHMM(hi), loMinute: lo, hiMinute: hi };
}

// ---------------------------------------------------------------------------
// §3.14 — Non-working gray background fill
// ---------------------------------------------------------------------------

/**
 * Compute the *non-working* time ranges per local day so the calendar can paint
 * the whole non-working span (before the shift, after the shift, and every break)
 * with a light-gray background. Working time stays white (no fill).
 *
 * Input: the server-provided `working` events (per-date intervals already honour
 * per-date be_working_days with weekday fallback — §3.13) plus the visible slot
 * bounds. For each day that has working intervals we emit the complement within
 * `[slotMin, slotMax]`. Days without working intervals (closed / no schedule) get
 * NO gray fill — an all-gray column reads as noise; FullCalendar leaves it white.
 */
function buildNonWorkingFillEvents(
  workingEvents: { startAt: string; endAt: string }[],
  timeZone: string,
  slotMinMinute: number,
  slotMaxMinute: number,
): { id: string; start: string; end: string }[] {
  if (workingEvents.length === 0) return [];

  // Group working intervals by local calendar day.
  const byDay = new Map<string, { startMs: number; endMs: number }[]>();
  for (const ev of workingEvents) {
    const start = DateTime.fromISO(ev.startAt, { zone: timeZone });
    if (!start.isValid) continue;
    const dayKey = start.toISODate();
    if (!dayKey) continue;
    const list = byDay.get(dayKey) ?? [];
    list.push({
      startMs: DateTime.fromISO(ev.startAt).toMillis(),
      endMs: DateTime.fromISO(ev.endAt).toMillis(),
    });
    byDay.set(dayKey, list);
  }

  const out: { id: string; start: string; end: string }[] = [];
  for (const [dayKey, intervals] of byDay.entries()) {
    intervals.sort((a, b) => a.startMs - b.startMs);
    // Day boundaries in the visible grid (local wall-clock minutes → UTC ms).
    const dayStartMs = DateTime.fromISO(dayKey, { zone: timeZone })
      .plus({ minutes: slotMinMinute })
      .toMillis();
    const dayEndMs = DateTime.fromISO(dayKey, { zone: timeZone })
      .plus({ minutes: slotMaxMinute })
      .toMillis();

    let cursor = dayStartMs;
    let idx = 0;
    for (const iv of intervals) {
      const ivStart = Math.max(iv.startMs, dayStartMs);
      const ivEnd = Math.min(iv.endMs, dayEndMs);
      if (ivStart > cursor) {
        out.push({
          id: `nonwork:${dayKey}:${idx++}`,
          start: new Date(cursor).toISOString(),
          end: new Date(ivStart).toISOString(),
        });
      }
      if (ivEnd > cursor) cursor = ivEnd;
    }
    if (cursor < dayEndMs) {
      out.push({
        id: `nonwork:${dayKey}:${idx++}`,
        start: new Date(cursor).toISOString(),
        end: new Date(dayEndMs).toISOString(),
      });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helper: event utilities
// ---------------------------------------------------------------------------

function eventClassName(event: CalendarEvent): string {
  // §3.7: фон/границу помечаем `!`-важными — в timeGrid FullCalendar красит событие
  // инлайн-стилем (синий по умолчанию), который перебивает обычные Tailwind-утилиты;
  // important-утилита выигрывает по каскаду (important author > inline). В month тоже
  // безопасно. Текст/пунктир/line-through оставляем обычными.
  if (event.kind === "freeSlot")
    return "!bg-emerald-500/10 text-emerald-900 !border-emerald-500/30 border-dashed";
  if (event.kind === "block") return "!bg-muted text-muted-foreground !border-border";
  // working: не рендерим (п.3), фон остаётся белым
  if (event.kind === "working") return "";
  if (event.kind === "break") return "!bg-slate-500/10 !border-transparent";
  // appointment
  if (isCancelledAppointmentStatus(event.status))
    return "!bg-destructive/15 text-destructive/80 !border-destructive/20 line-through";
  if (event.status === "awaiting_payment" || event.prepaymentPending)
    return "!bg-amber-500/15 text-amber-900 !border-amber-500/40";
  if (event.packageUsageRef || event.packageTitle)
    return "!bg-violet-500/15 text-violet-900 !border-violet-500/40";
  // дефолтная запись чуть насыщеннее (R10 «чуть темнее для всего»); прошлые
  // дополнительно приглушаются через .fc-event-past opacity в <style>.
  return "!bg-primary/15 text-foreground !border-primary/35";
}

function eventTitle(event: CalendarEvent): string {
  if (event.kind === "freeSlot") return "Свободно";
  if (event.kind === "working") return "Рабочее время";
  if (event.kind === "break") return "Перерыв";
  if (event.kind === "block") return event.title ?? "Блокировка";
  const packagePrefix = event.packageUsageRef || event.packageTitle ? "✅ " : "";
  const parts = [event.patientName ?? "Запись", event.serviceTitle].filter(Boolean);
  return `${packagePrefix}${parts.join(" · ")}`;
}

/** Для месячного вида: только фамилия (первое слово) */
function eventLastName(event: CalendarEvent): string {
  if (event.kind !== "appointment") return eventTitle(event);
  const name = event.patientName ?? "Запись";
  return name.split(" ")[0] ?? name;
}

// ---------------------------------------------------------------------------
// KPI Row (D2)
// ---------------------------------------------------------------------------

const KPI_ITEMS: Array<{ key: keyof ScheduleKpis; label: string }> = [
  { key: "recordsInPeriod", label: "Записей" },
  { key: "pastInPeriod", label: "Прошло" },
  { key: "futureInPeriod", label: "Впереди" },
  { key: "bySubscriptionInPeriod", label: "По абонементу" },
  { key: "firstVisitInPeriod", label: "Первичных" },
  { key: "repeatVisitInPeriod", label: "Повторных" },
  { key: "uniquePatientsInPeriod", label: "Уникальных" },
  { key: "cancellationsInPeriod", label: "Отмены" },
  { key: "reschedulesInPeriod", label: "Переносы" },
];

type KpiRowTabProps = {
  kpis: ScheduleKpis | null;
  kpisLoading: boolean;
  onKpiClick?: (key: keyof ScheduleKpis) => void;
};

function KpiRowTab({ kpis, kpisLoading, onKpiClick }: KpiRowTabProps) {
  return (
    <div
      className="grid grid-cols-3 gap-2 md:grid-cols-5 xl:grid-cols-9 md:gap-2"
      data-testid="cal-kpi-row"
    >
      {KPI_ITEMS.map(({ key, label }) => (
        <div
          key={key}
          className={cn(doctorStatCardShellClass, doctorStatCardInteractiveClass)}
          data-testid={`kpi-${key}`}
          role="button"
          tabIndex={0}
          onClick={() => onKpiClick?.(key)}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") onKpiClick?.(key); }}
        >
          <p className={doctorMetricLabelClass}>{label}</p>
          <p className={doctorMetricValueClass}>
            {kpisLoading && kpis === null ? (
              <span className="text-muted-foreground text-sm">…</span>
            ) : (
              (kpis?.[key] ?? 0)
            )}
          </p>
        </div>
      ))}
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
    return "border-destructive/25 bg-destructive/10 text-destructive/80 hover:bg-destructive/15";
  const isPast = parseFeedInstant(appt.startAt, timeZone) < DateTime.now();
  const base =
    appt.status === "awaiting_payment" || appt.prepaymentPending
      ? "border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/15"
      : appt.packageUsageRef || appt.packageTitle
        ? "border-violet-500/40 bg-violet-500/10 hover:bg-violet-500/15"
        : "border-primary/30 bg-primary/10 hover:bg-primary/15";
  return cn(base, isPast && "opacity-60");
}

function ListDayCard({ dateKey, label, appointments, timeZone, onSelect, nextApptId }: ListDayCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
      data-testid={`list-day-${dateKey}`}
    >
      <p className="text-sm font-semibold text-foreground capitalize">{label}</p>
      <div className="flex flex-col gap-1">
        {appointments.map((appt) => {
          const start = parseFeedInstant(appt.startAt, timeZone).toFormat("HH:mm");
          const end = parseFeedInstant(appt.endAt, timeZone).toFormat("HH:mm");
          const cancelled = isCancelledAppointmentStatus(appt.status);
          const isNext = appt.id === nextApptId;
          return (
            <button
              key={appt.id}
              type="button"
              onClick={() => onSelect(appt)}
              className={cn(
                "flex w-full items-start gap-3 rounded-md border px-3 py-2 text-left text-sm",
                isNext ? "ring-2 ring-primary/70 ring-offset-1" : "",
                listRowClass(appt, timeZone),
              )}
              data-testid={`list-appt-${appt.id}`}
            >
              <span className="shrink-0 font-semibold tabular-nums">
                {start}–{end}
              </span>
              <span className={cn("min-w-0 truncate", cancelled && "line-through")}>
                {appt.patientName ?? "Запись"}
              </span>
              {isNext && (
                <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-primary">
                  Следующая
                </span>
              )}
              {cancelled ? (
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-destructive">
                  Отмена
                </span>
              ) : null}
              {appt.branchTitle ? (
                <span className="ml-auto shrink-0 text-xs opacity-70">{appt.branchTitle}</span>
              ) : null}
            </button>
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

function ListView({
  events,
  timeZone,
  rangeFrom,
  rangeTo,
  onSelect,
}: ListViewProps) {
  const from = DateTime.fromISO(rangeFrom, { zone: timeZone });
  const to = DateTime.fromISO(rangeTo, { zone: timeZone });

  // Build list of all days in range that have appointments
  const totalDays = Math.ceil(to.diff(from, "days").days);
  const dayGroups: Array<{ dateKey: string; label: string; appointments: CalendarAppointmentEvent[] }> = [];

  for (let i = 0; i < totalDays; i++) {
    const day = from.plus({ days: i });
    const dayKey = day.toISODate() ?? "";
    const appointments = events
      .filter(
        (e): e is CalendarAppointmentEvent =>
          e.kind === "appointment" &&
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
        label: day.setLocale("ru").toFormat("cccc, d LLLL"),
        appointments,
      });
    }
  }

  // SCH-09: find first upcoming non-cancelled appointment across all day groups
  const now = DateTime.now().setZone(timeZone);
  let nextApptId: string | undefined;
  outer: for (const { appointments } of dayGroups) {
    for (const appt of appointments) {
      if (!isCancelledAppointmentStatus(appt.status) && parseFeedInstant(appt.startAt, timeZone) > now) {
        nextApptId = appt.id;
        break outer;
      }
    }
  }

  return (
    <div className="flex flex-col gap-3" data-testid="list-view">
      {dayGroups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="list-empty">
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
// Right panel stub (D5)
// ---------------------------------------------------------------------------

type NearestWindowStubProps = {
  apiBase: string;
  branchId: string | null;
};

function NearestWindowLine({ apiBase: _apiBase, branchId }: NearestWindowStubProps) {
  const [windowStr, setWindowStr] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const qs = buildQuery({ branchId });
    void fetch(`${NEAREST_WINDOW_API}?${qs}`)
      .then((res) => res.json())
      .then((json: NearestWindowResponse) => {
        if (cancelled) return;
        if (json.ok && json.window) {
          // Extract time part: just HH:MM
          const from = json.window.from.slice(11, 16);
          const to = json.window.to.slice(11, 16);
          setWindowStr(`${from}–${to}`);
        }
      })
      .catch(() => {
        // Деградация: ничего не показываем
      });
    return () => {
      cancelled = true;
    };
  }, [branchId]);

  if (!windowStr) return null;

  return (
    <p className="text-xs text-muted-foreground" data-testid="nearest-window-hint">
      Ближайшее окно сегодня: {windowStr}
    </p>
  );
}

type RightPanelEmptyStubProps = {
  filterMeta: CalendarFilterMeta;
  activeFilters: { specialistId: string | null; branchId: string | null; roomId: string | null; serviceId: string | null };
  branchId: string | null;
  onCreateClick: () => void;
};

function RightPanelEmptyStub({ branchId }: RightPanelEmptyStubProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-4 flex flex-col gap-3 items-center text-center"
      data-testid="right-panel-empty"
    >
      <div className="text-2xl text-muted-foreground/40 select-none">📋</div>
      <p className="text-sm font-medium text-foreground">Запись не выбрана</p>
      <p className="text-xs text-muted-foreground">
        Выберите запись в календаре, чтобы просмотреть детали
      </p>
      <NearestWindowLine apiBase={API_BASE} branchId={branchId} />
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
  isActive,
  initialTimeZone,
}: ScheduleTabProps) {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [timeZone] = useState(initialTimeZone ?? "Europe/Moscow");
  const [view, setViewState] = useState<CalV26View>(() => resolveView(deepLinkParams.view));
  const [anchorDate, setAnchorDateState] = useState<string>(() =>
    resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const [branchId, setBranchIdState] = useState<string | null>(deepLinkParams.location ?? null);
  const [serviceId, setServiceIdState] = useState<string | null>(deepLinkParams.service ?? null);
  // drill-down: where to go back after drill-down day ("from" deep-link)
  const [drillBackView, setDrillBackView] = useState<CalV26View | null>(
    deepLinkParams.from ? (resolveView(deepLinkParams.from) ?? null) : null,
  );
  // Render mode: calendar or list
  const [renderMode, setRenderModeState] = useState<RenderMode>(() =>
    resolveRenderMode(deepLinkParams.render),
  );

  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [kpis, setKpis] = useState<ScheduleKpis | null>(null);
  const [kpisLoading, setKpisLoading] = useState(false);
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [kpiModalFilter, setKpiModalFilter] = useState<keyof ScheduleKpis | null>(null);
  // R32: время старта, подставляемое в форму создания при выделении области.
  const [createInitialStart, setCreateInitialStart] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // R34: подтверждение переноса (drag/resize) перед применением.
  const [pendingReschedule, setPendingReschedule] = useState<PendingReschedule | null>(null);
  const pendingRescheduleRef = useRef<{
    appointment: CalendarAppointmentEvent;
    arg: { revert: () => void };
    newStartAt: string;
    newEndAt: string;
  } | null>(null);
  const [rescheduleComment, setRescheduleComment] = useState("");
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleBusy, setRescheduleBusy] = useState(false);

  // ─── Sync state → deep-link ────────────────────────────────────────────────

  const setView = useCallback(
    (v: CalV26View) => {
      setViewState(v);
      onDeepLinkChange("view", v);
    },
    [onDeepLinkChange],
  );

  const setAnchorDate = useCallback(
    (d: string) => {
      setAnchorDateState(d);
      onDeepLinkChange("date", d);
    },
    [onDeepLinkChange],
  );

  const setBranchId = useCallback(
    (v: string | null) => {
      setBranchIdState(v);
      onDeepLinkChange("location", v);
    },
    [onDeepLinkChange],
  );

  const setServiceId = useCallback(
    (v: string | null) => {
      setServiceIdState(v);
      onDeepLinkChange("service", v);
    },
    [onDeepLinkChange],
  );

  const setRenderMode = useCallback(
    (mode: RenderMode) => {
      setRenderModeState(mode);
      onDeepLinkChange("render", mode);
    },
    [onDeepLinkChange],
  );

  // ─── Drill-down day ────────────────────────────────────────────────────────

  const drillDownDay = useCallback(
    (dateKey: string) => {
      // Remember current view for Назад
      const backView = view === "day" ? drillBackView ?? "3days" : view;
      setDrillBackView(backView);
      onDeepLinkChange("from", backView);
      setView("day");
      setAnchorDate(dateKey);
    },
    [view, drillBackView, onDeepLinkChange, setView, setAnchorDate],
  );

  const drillBack = useCallback(() => {
    const back = drillBackView ?? "3days";
    setDrillBackView(null);
    onDeepLinkChange("from", null);
    setView(back);
  }, [drillBackView, onDeepLinkChange, setView]);

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadFeed = useCallback(
    (overrideView?: CalV26View, overrideAnchor?: string) => {
      const v = overrideView ?? view;
      const anchor = overrideAnchor ?? anchorDate;

      startTransition(async () => {
        try {
          const range = visibleRange(v, anchor, timeZone);
          const from = range.from;
          const to = range.to;

          // Map v26 view to API view param
          const apiView =
            v === "3days"
              ? "3days"
              : v === "weekgrid"
                ? "week"
                : v === "month"
                  ? "month"
                  : "day";

          const qs = buildQuery({
            view: apiView,
            from,
            to,
            branchId,
            serviceId,
          });
          const res = await fetch(`${API_BASE}/calendar?${qs}`);
          const raw = await res.text();
          if (!raw.trim()) {
            setError(res.ok ? "load_failed" : `load_failed_${res.status}`);
            return;
          }
          let json: CalendarResponse;
          try {
            json = JSON.parse(raw) as CalendarResponse;
          } catch {
            setError("load_failed");
            return;
          }
          if (!res.ok || !json.ok) {
            setError(json.error ?? "load_failed");
            return;
          }
          setData(json);
          setError(null);
          setBranchIdState((prev) =>
            resolveCalendarCreateFieldValue(json.filters.branches, null, prev),
          );
          setServiceIdState((prev) =>
            resolveCalendarCreateFieldValue(json.filters.services, null, prev),
          );
        } catch {
          setError("network_error");
        }
      });
    },
    [view, anchorDate, branchId, serviceId, timeZone],
  );

  const loadKpis = useCallback(
    (v: CalV26View, anchor: string) => {
      // KPI скрыт в day
      if (v === "day") return;

      const { from, to } = visibleRange(v, anchor, timeZone);
      setKpisLoading(true);

      void fetch(
        `${KPIS_API}?${buildQuery({ from, to, branchId, serviceId })}`,
      )
        .then((res) => res.json())
        .then((json: { ok: boolean; kpis: ScheduleKpis }) => {
          if (json.ok && json.kpis) setKpis(json.kpis);
        })
        .catch(() => {
          // Деградация: показываем последние известные KPI
        })
        .finally(() => {
          setKpisLoading(false);
        });
    },
    [branchId, serviceId, timeZone],
  );

  // Parallel load: feed + kpis
  const load = useCallback(() => {
    loadFeed();
    loadKpis(view, anchorDate);
  }, [loadFeed, loadKpis, view, anchorDate]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchorDate, branchId, serviceId]);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 30_000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") load();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [load, isActive]);

  // ─── Period navigation ─────────────────────────────────────────────────────

  function shiftAnchor(delta: number) {
    const dt = DateTime.fromISO(anchorDate, { zone: timeZone });
    let next: string | null;
    if (view === "month") {
      next = dt.plus({ months: delta > 0 ? 1 : -1 }).toISODate();
    } else if (view === "weekgrid") {
      next = dt.plus({ days: delta * 7 }).toISODate();
    } else if (view === "3days") {
      next = dt.plus({ days: delta * 3 }).toISODate();
    } else {
      // day
      next = dt.plus({ days: delta }).toISODate();
    }
    if (next) setAnchorDate(next);
  }

  function goToday() {
    const today = DateTime.now().setZone(timeZone).toISODate();
    if (today) setAnchorDate(today);
  }

  // ─── Calendar events ───────────────────────────────────────────────────────

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  const activeFilters = useMemo(
    () => ({ specialistId: null, branchId, roomId: null, serviceId }),
    [branchId, serviceId],
  );

  const currentTimeZone = data?.timeZone ?? timeZone;
  const workingBounds = data?.workingBounds;
  const { slotMinTime, slotMaxTime, loMinute, hiMinute } = deriveSlotTimes(workingBounds, data?.events, currentTimeZone);

  const calendarEvents = useMemo(() => {
    if (!data) return [];
    const isTimeGrid = view !== "month";
    // §3.14: paint the whole non-working span (pre-shift + post-shift + breaks)
    // gray; working time stays white. Only in hour-grid views (3 дня / Неделя /
    // День) — a month grid has no time axis to fill. Replaces the old per-break
    // background events; the complement fill subsumes them.
    const grayFill =
      isTimeGrid && workingBounds
        ? buildNonWorkingFillEvents(
            data.events.filter((e) => e.kind === "working"),
            currentTimeZone,
            loMinute,
            hiMinute,
          ).map((f) => ({
            id: f.id,
            start: f.start,
            end: f.end,
            display: "background" as const,
            classNames: ["!bg-slate-300"],
            editable: false,
            extendedProps: { kind: "nonworking" as const },
          }))
        : [];
    const mapped = data.events.map((event) => {
      // Рабочее время — не рендерим (фон белый).
      if (event.kind === "working") return null;

      // SCH-10: перерывы рендерим как фоновые события с более тёмным серым,
      // чтобы их можно было отличить от нерабочего времени (до/после смены).
      if (event.kind === "break" && isTimeGrid) {
        return {
          id: `break:${event.id}`,
          start: toFcDate(event.startAt, currentTimeZone),
          end: toFcDate(event.endAt, currentTimeZone),
          title: "Перерыв",
          display: "background" as const,
          classNames: ["!bg-slate-300/60 !border-l-2 !border-slate-400/60"],
          editable: false,
          extendedProps: { kind: "break" as const },
        };
      }
      if (event.kind === "break") return null;

      if (event.kind === "block") {
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
      if (event.kind === "freeSlot") {
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
        title: view === "month" ? eventLastName(event) : eventTitle(event),
        editable: !isCancelledAppointmentStatus(event.status),
        durationEditable: !isCancelledAppointmentStatus(event.status),
        startEditable: !isCancelledAppointmentStatus(event.status),
        classNames: [eventClassName(event)],
        extendedProps: {
          kind: event.kind,
          appointment: event,
        },
      };
    }).filter((x): x is NonNullable<typeof x> => x !== null);
    return [...grayFill, ...mapped] as FullCalendarOptions["events"];
  }, [data, view, workingBounds, currentTimeZone]);

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
          method: "POST",
          headers: { "Content-Type": "application/json" },
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
      await loadFeed();
      loadKpis(view, anchorDate);
      return { ok: true };
    },
    [loadFeed, loadKpis, view, anchorDate],
  );

  // R34: drag/resize не применяются сразу — открываем диалог подтверждения.
  const openRescheduleConfirm = useCallback((arg: any) => {
    const appointment = arg.event.extendedProps?.appointment as
      | CalendarAppointmentEvent
      | undefined;
    if (!appointment) return arg.revert();
    const nextStart = arg.event.start?.toISOString();
    const nextEnd = arg.event.end?.toISOString();
    if (!nextStart || !nextEnd) return arg.revert();
    pendingRescheduleRef.current = { appointment, arg, newStartAt: nextStart, newEndAt: nextEnd };
    setRescheduleComment("");
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
    (arg: any) => {
      const start: Date | null = arg.start ?? null;
      if (!start) return;
      // FC (без tz-плагина) хранит настенное время в UTC-полях даты — читаем их
      // напрямую, без конверсии зоны, иначе datetime-local уезжает на смещение.
      const startLocal =
        DateTime.fromJSDate(start, { zone: "utc" }).toFormat("yyyy-MM-dd'T'HH:mm") || null;
      setSelected(null);
      setCreateInitialStart(startLocal);
      setShowCreatePanel(true);
      onDeepLinkChange("appt", null);
    },
    [onDeepLinkChange],
  );

  // ─── FullCalendar view mapping ─────────────────────────────────────────────

  const fcView =
    view === "day"
      ? "timeGridDay"
      : view === "weekgrid"
        ? "timeGridWeek"
        : view === "month"
          ? "dayGridMonth"
          : "timeGridDay"; // 3days handled as custom range — use timeGridDay with visibleRange

  // For 3days, use timeGrid with 3 days duration
  const fcInitialView = useMemo(() => {
    if (view === "3days") return "timeGrid3days";
    return fcView;
  }, [view, fcView]);

  const fcViews = useMemo((): NonNullable<FullCalendarOptions["views"]> => {
    if (view === "3days") {
      return {
        timeGrid3days: {
          type: "timeGrid",
          duration: { days: 3 },
          buttonText: "3 дня",
        },
      };
    }
    if (view === "month") {
      return {
        dayGridMonth: {
          dayCellClassNames: () => [],
        },
      };
    }
    return {};
  }, [view]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const showKpi = view !== "day";

  // visibleRange for list mode
  const listRange = useMemo(() => visibleRange(view, anchorDate, currentTimeZone), [view, anchorDate, currentTimeZone]);

  // Search: filter appointments by patientName
  const visibleEvents = useMemo<CalendarEvent[]>(() => {
    if (!searchQuery.trim()) return data?.events ?? [];
    const q = searchQuery.toLowerCase();
    return (data?.events ?? []).filter(
      (e) => e.kind === "appointment" && (e.patientName ?? "").toLowerCase().includes(q),
    );
  }, [data?.events, searchQuery]);

  // KPI modal: predicate map + filtered items
  const KPI_PREDICATES: Partial<Record<keyof ScheduleKpis, (e: CalendarAppointmentEvent) => boolean>> = {
    cancellationsInPeriod: (e) => isCancelledAppointmentStatus(e.status),
    firstVisitInPeriod: (_e) => false, // no isFirstVisit field on type; show nothing
    repeatVisitInPeriod: (_e) => false, // same
    bySubscriptionInPeriod: (e) => Boolean(e.packageUsageRef || e.packageTitle),
    pastInPeriod: (e) => parseFeedInstant(e.startAt, currentTimeZone) < DateTime.now(),
    futureInPeriod: (e) => parseFeedInstant(e.startAt, currentTimeZone) >= DateTime.now(),
    uniquePatientsInPeriod: (_e) => true,
    recordsInPeriod: (_e) => true,
    reschedulesInPeriod: (e) => e.rescheduleCount > 0,
  };

  const kpiModalItems = useMemo<CalendarAppointmentEvent[]>(() => {
    if (!kpiModalFilter) return [];
    const pred = KPI_PREDICATES[kpiModalFilter];
    if (!pred) return [];
    return (data?.events ?? []).filter(
      (e): e is CalendarAppointmentEvent => e.kind === "appointment" && pred(e),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kpiModalFilter, data?.events, currentTimeZone]);

  const kpiModalTitle = kpiModalFilter
    ? (KPI_ITEMS.find((k) => k.key === kpiModalFilter)?.label ?? "")
    : "";

  return (
    <div className={cn(
      "flex flex-col gap-4",
      renderMode === "list" && "overflow-hidden h-[calc(100dvh_-_3.5rem_-_9rem)]",
    )}>
      {/* KPI row (D2) — full width, hidden in day */}
      {showKpi ? (
        <KpiRowTab
          kpis={kpis}
          kpisLoading={kpisLoading}
          onKpiClick={(key) => setKpiModalFilter((prev) => prev === key ? null : key)}
        />
      ) : null}

      {/* Toolbar (D1) — full width. R30: прилипает 2-м рядом под per-page-шапкой
          (комбинируем базовый sticky-класс с top-офсетом, как эталон exercises). */}
      <div
        className={cn(
          DOCTOR_CATALOG_STICKY_BAR_CLASS,
          DOCTOR_STICKY_PAGE_TOOLBAR_TOP_CLASS,
          "flex flex-wrap items-center gap-2",
        )}
        data-testid="cal-toolbar"
      >
        {/* View switcher: 3 дня · Неделя · Месяц (без «Лента» и без «День») */}
        <div className="flex gap-1" role="group" aria-label="Режим отображения">
          {(
            [
              { v: "3days" as const, label: "3 дня" },
              { v: "weekgrid" as const, label: "Неделя" },
              { v: "month" as const, label: "Месяц" },
            ] as const
          ).map(({ v, label }) => (
            <Button
              key={v}
              type="button"
              size="sm"
              variant={view === v ? "default" : "outline"}
              onClick={() => {
                // При переключении из day (drill-down) — выходим из drill-down
                if (view === "day") {
                  setDrillBackView(null);
                  onDeepLinkChange("from", null);
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
        {view === "day" ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={drillBack}
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
            variant={renderMode === "calendar" ? "default" : "outline"}
            className="size-[32px] shrink-0"
            aria-label="Календарь"
            title="Календарь"
            onClick={() => setRenderMode("calendar")}
            data-testid="render-btn-calendar"
          >
            <Calendar className="size-4" aria-hidden />
          </Button>
          <Button
            type="button"
            size="icon"
            variant={renderMode === "list" ? "default" : "outline"}
            className="size-[32px] shrink-0"
            aria-label="Список"
            title="Список"
            onClick={() => setRenderMode("list")}
            data-testid="render-btn-list"
          >
            <List className="size-4" aria-hidden />
          </Button>
        </div>

        {/* Search bar (list mode) */}
        {renderMode === "list" ? (
          <div className="relative flex-1 min-w-[8rem] max-w-xs">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" aria-hidden />
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
        {renderMode === "list" && searchQuery.trim() ? (
          <span className="text-xs text-muted-foreground" data-testid="search-count">
            найдено {visibleEvents.filter((e) => e.kind === "appointment").length}
          </span>
        ) : null}

        {/* «Сегодня» — вернуть текущий вид к сегодняшнему периоду */}
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={goToday}
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
            onClick={() => shiftAnchor(-1)}
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
            onClick={() => shiftAnchor(1)}
            aria-label="Следующий период"
            data-testid="period-next"
          >
            ▶
          </Button>
        </>

        {/* Filters */}
        <DoctorCalendarToolbarFilter
          noneLabel="Локация"
          options={filters.branches}
          value={branchId}
          onChange={setBranchId}
        />
        <DoctorCalendarToolbarFilter
          noneLabel="Услуга"
          options={filters.services}
          value={serviceId}
          onChange={setServiceId}
        />

        {/* CTA — постоянная, всегда справа */}
        <Button
          type="button"
          size="sm"
          className="ml-auto"
          onClick={() => {
            setSelected(null);
            setShowCreatePanel(true);
          }}
          data-testid="create-appointment-btn"
        >
          + Создать запись
        </Button>
      </div>

      {/* Error */}
      {error ? (
        <p className="text-sm text-destructive" data-testid="cal-error">
          {error}
        </p>
      ) : null}

      {/* Main content row: calendar/list + aside panel */}
      <div className={cn(
        "flex flex-col gap-4 lg:flex-row",
        renderMode === "list" && "min-h-0 flex-1 overflow-hidden",
      )}>
        {/* Content area */}
        <div className={cn(
          "min-w-0 flex-1",
          renderMode === "list" && "overflow-y-auto",
        )}>
          {renderMode === "list" ? (
            // List view — period-bound, grouped by day
            <ListView
              events={visibleEvents}
              anchorDate={anchorDate}
              timeZone={currentTimeZone}
              rangeFrom={listRange.from}
              rangeTo={listRange.to}
              onSelect={(appt) => {
                setSelected(appt);
                setShowCreatePanel(false);
                onDeepLinkChange("appt", appt.id);
              }}
            />
          ) : (
            // FullCalendar
            <div className="overflow-hidden rounded-xl border border-border bg-card">
              <style>{`
                /* §3.7 — статусные Tailwind-цвета приходят important-утилитами из eventClassName
                   (бьют инлайн-синий FC в timeGrid). Здесь убираем тень FC,
                   принудительно делаем текст записей ТЁМНЫМ (FC форсит белый через
                   --fc-event-text-color, его и переопределяем — иначе белое на светлом),
                   и курсор pointer на всех записях (в т.ч. отменённых — клик работает). */

                /* CAL-P1 — kill green flash on first paint.
                   FC default --fc-bg-event-color is #8fdf82 (green, opacity 0.3).
                   All display:"background" events here use Tailwind !bg-slate-* which win
                   the cascade, but only after the stylesheet settles. At frame-0 FC paints
                   its default green before the important-utilities kick in. Setting
                   --fc-bg-event-color to transparent on the .fc root means the very first
                   paint is transparent (not green); the Tailwind !bg-slate-300 / !bg-slate-300/60
                   utilities apply in the same frame and set the final slate colour normally. */
                .fc {
                  --fc-bg-event-color: transparent;
                }

                .fc-timegrid-event-harness { margin-inline: 1px; }
                .fc-event {
                  box-shadow: none !important;
                  cursor: pointer !important;
                  --fc-event-text-color: var(--foreground) !important;
                }
                .fc-event .fc-event-main { color: var(--foreground) !important; }
                /* R10 — прошедшие записи приглушаем, будущие/актуальные ярче */
                .fc-event.fc-event-past { opacity: 0.6; }

                /* §3.9 — мягкая типографика заголовков колонок/дней */
                .fc-col-header-cell-cushion {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                  text-transform: none !important;
                  color: var(--muted-foreground, currentColor) !important;
                }
                .fc-col-header-cell {
                  font-size: 0.75rem !important;
                  font-weight: 500 !important;
                }

                /* §3.10 — убрать жёлтую заливку «сегодня» в месяце */
                .fc .fc-day-today {
                  --fc-today-bg-color: transparent !important;
                  background-color: transparent !important;
                }

                /* §3.10/(б) — кружок «сегодня»: приглушённый прозрачно-зелёный.
                   ВАЖНО: тема в oklch, --primary вообще синий → используем emerald
                   через color-mix(in oklab, var(--color-emerald-500) …), иначе цвет
                   получался невалидным/прозрачным (today был не виден). */
                .fc-daygrid-day-number.fc-today-circle {
                  display: inline-flex;
                  align-items: center;
                  justify-content: center;
                  width: 1.5rem;
                  height: 1.5rem;
                  border-radius: 9999px;
                  background-color: color-mix(in oklab, var(--color-emerald-500) 24%, transparent);
                  color: var(--foreground);
                  font-weight: 600;
                }

                /* §3.11 — мельче цифры дат в месячном виде */
                .fc-daygrid-day-number {
                  font-size: 0.6875rem !important;
                  font-weight: 400 !important;
                  line-height: 1.5 !important;
                }

                /* §3.12 — «сегодня» в Неделя/3 дня: зелёная заливка ячейки заголовка (emerald/oklab) */
                .fc-col-header-cell.fc-day-today {
                  background-color: color-mix(in oklab, var(--color-emerald-500) 16%, transparent) !important;
                }
                .fc-col-header-cell.fc-day-today .fc-col-header-cell-cushion {
                  display: inline;
                  width: auto;
                  height: auto;
                  border-radius: 0;
                  background-color: transparent;
                  color: var(--foreground);
                  font-weight: 600;
                }
              `}</style>
              <FullCalendar
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin, luxonPlugin]}
                locale={ruLocale}
                key={`${view}:${anchorDate}:${branchId ?? "all"}:${serviceId ?? "all"}`}
                initialView={fcInitialView}
                views={fcViews}
                initialDate={anchorDate}
                timeZone={currentTimeZone}
                events={calendarEvents}
                headerToolbar={false}
                editable={view !== "month"}
                eventDurationEditable={view !== "month"}
                eventStartEditable={view !== "month"}
                // R32: выделение области создаёт запись; клик (без движения) не выделяет,
                // чтобы остаться сбросом выбора (R24). selectMinDistance разводит клик и drag.
                selectable={view !== "month"}
                selectMirror
                selectMinDistance={5}
                select={onSelect}
                nowIndicator
                dayMaxEvents
                allDaySlot={false}
                height="auto"
                slotMinTime={slotMinTime}
                slotMaxTime={slotMaxTime}
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
                // Клик по числу в month → drill-down
                dayCellContent={(arg) => {
                  if (view === "month") {
                    const isToday =
                      DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() ===
                      DateTime.now().setZone(currentTimeZone).toISODate();
                    return (
                      <button
                        type="button"
                        className={cn(
                          "fc-daygrid-day-number hover:underline cursor-pointer",
                          isToday && "fc-today-circle",
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
                      </button>
                    );
                  }
                  return null;
                }}
                eventClick={(arg) => {
                  const appointment = arg.event.extendedProps?.appointment as
                    | CalendarAppointmentEvent
                    | undefined;
                  if (!appointment) return;
                  setSelected(appointment);
                  setShowCreatePanel(false);
                  onDeepLinkChange("appt", appointment.id);
                }}
                // C7: клик по свободному месту сетки → открыть форму создания с подставленным временем.
                // В month-режиме allDay=true, время не определено — подставляем только дату.
                dateClick={(arg) => {
                  const clicked: Date | null = arg.date ?? null;
                  const isTimeGrid = !arg.allDay;
                  const startLocal = clicked
                    ? isTimeGrid
                      ? DateTime.fromJSDate(clicked, { zone: "utc" }).toFormat(
                          "yyyy-MM-dd'T'HH:mm",
                        )
                      : DateTime.fromJSDate(clicked, { zone: "utc" }).toFormat(
                          "yyyy-MM-dd'T'09:00",
                        )
                    : null;
                  setSelected(null);
                  setCreateInitialStart(startLocal);
                  setShowCreatePanel(true);
                  onDeepLinkChange("appt", null);
                }}
                eventDrop={onDrop}
                eventResize={onResize}
                eventContent={(info) => {
                  const appointment = info.event.extendedProps?.appointment as
                    | CalendarAppointmentEvent
                    | undefined;
                  if (appointment) {
                    if (view === "month") {
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
                  return (
                    <div className="truncate px-1 py-0.5 text-[11px]">{info.event.title}</div>
                  );
                }}
              />
            </div>
          )}
        </div>

        {/* Right panel (D5) */}
        <aside className="w-full shrink-0 lg:w-80">
          {selected || showCreatePanel ? (
            <DoctorCalendarEventPanel
              apiBase={API_BASE}
              selected={selected}
              timeZone={currentTimeZone}
              filterMeta={filters}
              activeFilters={activeFilters}
              // §3.6: при открытии через «+ Создать запись» — сразу в форму создания
              startInCreate={showCreatePanel && !selected}
              // R32: подставленное время старта при выделении области
              createInitialStart={createInitialStart}
              onClose={() => {
                setSelected(null);
                setShowCreatePanel(false);
                setCreateInitialStart(null);
                onDeepLinkChange("appt", null);
              }}
              onChanged={() => {
                setSelected(null);
                setShowCreatePanel(false);
                setCreateInitialStart(null);
                onDeepLinkChange("appt", null);
                load();
              }}
            />
          ) : (
            <RightPanelEmptyStub
              filterMeta={filters}
              activeFilters={activeFilters}
              branchId={branchId}
              onCreateClick={() => setShowCreatePanel(true)}
            />
          )}
        </aside>
      </div>

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
        searchPlaceholder="Поиск по имени…"
        searchPredicate={(item, q) =>
          (item.patientName ?? "").toLowerCase().includes(q.toLowerCase())
        }
        renderItem={(item) => (
          <div className="flex justify-between items-center py-1 text-sm">
            <span className="font-medium">{item.patientName ?? "Запись"}</span>
            <span className="text-xs text-muted-foreground">
              {parseFeedInstant(item.startAt, currentTimeZone).toFormat("d MMM HH:mm")}
            </span>
          </div>
        )}
      />
    </div>
  );
}
