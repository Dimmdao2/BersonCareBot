"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Calendar, List } from "lucide-react";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import {
  doctorMetricValueClass,
  doctorMetricLabelClass,
  doctorStatCardShellClass,
  doctorStatCardInteractiveClass,
} from "@/shared/ui/doctor/doctorVisual";
import { cn } from "@/lib/utils";
import { DoctorCalendarEventPanel } from "../../calendar/DoctorCalendarEventPanel";
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

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const API_BASE = "/api/doctor/booking-engine";
const KPIS_API = "/api/doctor/schedule-kpis";
const NEAREST_WINDOW_API = "/api/doctor/schedule/nearest-free-window";

const DEFAULT_SLOT_MIN = "06:00:00";
const DEFAULT_SLOT_MAX = "23:00:00";

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
 * чтобы ранние/поздние приёмы (7-8 утра и т.п.) НЕ обрезались. Час запаса с краёв.
 * Если нет ни рабочих границ, ни записей — дефолт.
 */
function deriveSlotTimes(
  workingBounds: WorkingBounds | null | undefined,
  events: CalendarEvent[] | undefined,
  timeZone: string,
): { slotMinTime: string; slotMaxTime: string } {
  let min: number | null = workingBounds ? workingBounds.minMinute : null;
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
    return { slotMinTime: DEFAULT_SLOT_MIN, slotMaxTime: DEFAULT_SLOT_MAX };
  }
  // Час запаса, выравнивание по часу, clamp в [0, 24ч].
  const lo = Math.max(0, Math.floor((min - 60) / 60) * 60);
  const hi = Math.min(24 * 60, Math.ceil((max + 60) / 60) * 60);
  return { slotMinTime: minuteToHHMM(lo), slotMaxTime: minuteToHHMM(hi) };
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
};

function KpiRowTab({ kpis, kpisLoading }: KpiRowTabProps) {
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
          onClick={() => {
            /* no-op: фильтрация — следующая итерация */
          }}
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
};

function ListDayCard({ dateKey, label, appointments, timeZone, onSelect }: ListDayCardProps) {
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
          return (
            <button
              key={appt.id}
              type="button"
              onClick={() => onSelect(appt)}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
              data-testid={`list-appt-${appt.id}`}
            >
              <span className="shrink-0 font-semibold tabular-nums text-foreground">
                {start}–{end}
              </span>
              <span className="min-w-0 truncate text-foreground">
                {appt.patientName ?? "Запись"}
              </span>
              {appt.branchTitle ? (
                <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                  {appt.branchTitle}
                </span>
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
          // R15: список = актуальные записи; отменённые скрываем (в календаре остаются).
          !isCancelledAppointmentStatus(e.status) &&
          parseFeedInstant(e.startAt, timeZone).toISODate() === dayKey,
      )
      .sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
    if (appointments.length > 0) {
      dayGroups.push({
        dateKey: dayKey,
        label: day.setLocale("ru").toFormat("cccc, d LLLL"),
        appointments,
      });
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
}: ScheduleTabProps) {
  // ─── State ─────────────────────────────────────────────────────────────────
  const [timeZone] = useState("Europe/Moscow");
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
  const [pending, startTransition] = useTransition();

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
  const { slotMinTime, slotMaxTime } = deriveSlotTimes(workingBounds, data?.events, currentTimeZone);

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
            workingBounds.minMinute,
            workingBounds.maxMinute,
          ).map((f) => ({
            id: f.id,
            start: f.start,
            end: f.end,
            display: "background" as const,
            classNames: ["!bg-slate-500/10 !border-transparent"],
            editable: false,
            extendedProps: { kind: "nonworking" as const },
          }))
        : [];
    const mapped = data.events.map((event) => {
      // Рабочее время — не рендерим (фон белый). Перерывы покрыты серой
      // заливкой нерабочего диапазона (§3.14) — отдельные break-эвенты не нужны.
      if (event.kind === "working" || event.kind === "break") return null;

      if (event.kind === "block") {
        return {
          id: `block:${event.id}`,
          start: event.startAt,
          end: event.endAt,
          title: eventTitle(event),
          editable: false,
          classNames: [eventClassName(event)],
          extendedProps: { kind: event.kind, block: event },
        };
      }
      if (event.kind === "freeSlot") {
        return {
          id: `free:${event.id}`,
          start: event.startAt,
          end: event.endAt,
          title: eventTitle(event),
          editable: false,
          classNames: [eventClassName(event)],
          extendedProps: { kind: event.kind },
        };
      }
      return {
        id: event.id,
        start: event.startAt,
        end: event.endAt,
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
    ): Promise<boolean> => {
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
      );
      const res = await fetch(
        `${API_BASE}/appointments/${encodeURIComponent(appointment.id)}/manual-reschedule`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ newStartAt: startAt, newEndAt: endAt, durationMinutes }),
        },
      );
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        load();
        return false;
      }
      await loadFeed();
      loadKpis(view, anchorDate);
      return true;
    },
    [load, loadFeed, loadKpis, view, anchorDate],
  );

  const onDrop = useCallback(
    async (arg: any) => {
      const appointment = arg.event.extendedProps?.appointment as
        | CalendarAppointmentEvent
        | undefined;
      if (!appointment) return arg.revert();
      const nextStart = arg.event.start?.toISOString();
      const nextEnd = arg.event.end?.toISOString();
      if (!nextStart || !nextEnd) return arg.revert();
      const ok = await performReschedule(appointment, nextStart, nextEnd);
      if (!ok) arg.revert();
    },
    [performReschedule],
  );

  const onResize = useCallback(
    async (arg: any) => {
      const appointment = arg.event.extendedProps?.appointment as
        | CalendarAppointmentEvent
        | undefined;
      if (!appointment) return arg.revert();
      const nextStart = arg.event.start?.toISOString();
      const nextEnd = arg.event.end?.toISOString();
      if (!nextStart || !nextEnd) return arg.revert();
      const ok = await performReschedule(appointment, nextStart, nextEnd);
      if (!ok) arg.revert();
    },
    [performReschedule],
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

  return (
    <div className="flex flex-col gap-4">
      {/* KPI row (D2) — full width, hidden in day */}
      {showKpi ? (
        <KpiRowTab kpis={kpis} kpisLoading={kpisLoading} />
      ) : null}

      {/* Toolbar (D1) — full width */}
      <div
        className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} flex flex-wrap items-center gap-2`}
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
      <div className="flex flex-col gap-4 lg:flex-row">
        {/* Content area */}
        <div className="min-w-0 flex-1">
          {renderMode === "list" ? (
            // List view — period-bound, grouped by day
            <ListView
              events={data?.events ?? []}
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
                plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
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
                // R24: клик по свободному месту календаря сбрасывает выбор записи.
                dateClick={() => {
                  setSelected(null);
                  setShowCreatePanel(false);
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
              onClose={() => {
                setSelected(null);
                setShowCreatePanel(false);
                onDeepLinkChange("appt", null);
              }}
              onChanged={() => {
                setSelected(null);
                setShowCreatePanel(false);
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
    </div>
  );
}
