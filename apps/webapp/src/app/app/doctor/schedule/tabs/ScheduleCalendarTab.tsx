"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { DateTime } from "luxon";
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

// View types for the v26 calendar tab switcher (3days / weekgrid / month / feed / day(drill-down))
type CalV26View = "3days" | "weekgrid" | "month" | "feed" | "day";

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

type AppointmentLayout = {
  leftPercent: number;
  widthPercent: number;
};

// ---------------------------------------------------------------------------
// Helper: visibleRange
// ---------------------------------------------------------------------------

/**
 * Вычисляет видимый диапазон для каждого вида.
 * Это единый источник истины для фида И KPI.
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

  if (view === "day") {
    const from = dt.startOf("day");
    const to = dt.startOf("day").plus({ days: 1 });
    return {
      from: from.toISO() ?? anchor,
      to: to.toISO() ?? anchor,
    };
  }

  // feed: ±30 дней
  const from = dt.startOf("day").minus({ days: 30 });
  const to = dt.startOf("day").plus({ days: 31 });
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
  // feed — label hidden in toolbar
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
    raw === "feed" ||
    raw === "day"
  )
    return raw;
  return "3days";
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

function deriveSlotTimes(workingBounds: WorkingBounds | null | undefined): {
  slotMinTime: string;
  slotMaxTime: string;
} {
  if (!workingBounds) return { slotMinTime: DEFAULT_SLOT_MIN, slotMaxTime: DEFAULT_SLOT_MAX };
  return {
    slotMinTime: minuteToHHMM(workingBounds.minMinute),
    slotMaxTime: minuteToHHMM(workingBounds.maxMinute),
  };
}

// ---------------------------------------------------------------------------
// Helper: event utilities
// ---------------------------------------------------------------------------

function eventClassName(event: CalendarEvent): string {
  if (event.kind === "freeSlot")
    return "bg-emerald-500/10 text-emerald-900 border-emerald-500/30 border-dashed";
  if (event.kind === "block") return "bg-muted text-muted-foreground border-border";
  if (event.kind === "working") return "bg-emerald-500/7";
  if (event.kind === "break") return "bg-slate-500/10";
  if (isCancelledAppointmentStatus(event.status))
    return "bg-destructive/10 text-destructive border-destructive/30 line-through";
  if (event.status === "awaiting_payment" || event.prepaymentPending)
    return "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/40";
  if (event.packageUsageRef || event.packageTitle)
    return "bg-violet-500/15 text-violet-900 dark:text-violet-100 border-violet-500/40";
  return "bg-primary/10 text-primary border-primary/30";
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

function computeAppointmentLayouts(
  events: CalendarEvent[],
  zone: string,
): Map<string, AppointmentLayout> {
  const map = new Map<string, AppointmentLayout>();
  const groups = new Map<string, CalendarAppointmentEvent[]>();
  for (const event of events) {
    if (event.kind !== "appointment") continue;
    const start = DateTime.fromISO(event.startAt).setZone(zone).toFormat("yyyy-LL-dd HH:mm");
    const end = DateTime.fromISO(event.endAt).setZone(zone).toFormat("yyyy-LL-dd HH:mm");
    const key = `${start}|${end}|${event.branchId ?? "any"}|${event.specialistId ?? "any"}`;
    const list = groups.get(key) ?? [];
    list.push(event);
    groups.set(key, list);
  }
  for (const eventsInGroup of groups.values()) {
    const active = eventsInGroup.filter((e) => !isCancelledAppointmentStatus(e.status));
    const cancelled = eventsInGroup.filter((e) => isCancelledAppointmentStatus(e.status));
    if (active.length === 0 || cancelled.length === 0) continue;
    const activeWidth = 75 / active.length;
    active.forEach((e, idx) => {
      map.set(e.id, { leftPercent: idx * activeWidth, widthPercent: activeWidth });
    });
    const cancelledWidth = 25 / cancelled.length;
    cancelled.forEach((e, idx) => {
      map.set(e.id, {
        leftPercent: 75 + idx * cancelledWidth,
        widthPercent: cancelledWidth,
      });
    });
  }
  return map;
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
// Feed view (D4) — бесконечный вертикальный поток карточек-дней
// ---------------------------------------------------------------------------

type FeedDayCardProps = {
  dateKey: string;
  label: string;
  appointments: CalendarAppointmentEvent[];
  timeZone: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
};

function FeedDayCard({ dateKey, label, appointments, timeZone, onSelect }: FeedDayCardProps) {
  return (
    <div
      className="rounded-xl border border-border bg-card p-3 flex flex-col gap-2"
      data-testid={`feed-day-${dateKey}`}
    >
      <p className="text-sm font-semibold text-foreground capitalize">{label}</p>
      <div className="flex flex-col gap-1">
        {appointments.map((appt) => {
          const start = DateTime.fromISO(appt.startAt).setZone(timeZone).toFormat("HH:mm");
          const end = DateTime.fromISO(appt.endAt).setZone(timeZone).toFormat("HH:mm");
          return (
            <button
              key={appt.id}
              type="button"
              onClick={() => onSelect(appt)}
              className="flex w-full items-start gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
              data-testid={`feed-appt-${appt.id}`}
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

type FeedViewProps = {
  events: CalendarEvent[];
  anchorDate: string;
  timeZone: string;
  rangeFrom: string;
  rangeTo: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
  onLoadMore: (direction: "past" | "future") => void;
  loading: boolean;
};

function FeedView({
  events,
  timeZone,
  rangeFrom,
  rangeTo,
  onSelect,
  onLoadMore,
  loading,
}: FeedViewProps) {
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
          DateTime.fromISO(e.startAt).setZone(timeZone).toISODate() === dayKey,
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
    <div className="flex flex-col gap-3" data-testid="feed-view">
      <button
        type="button"
        className="text-sm text-primary hover:underline text-center py-2"
        onClick={() => onLoadMore("past")}
        disabled={loading}
        data-testid="feed-load-past"
      >
        {loading ? "Загрузка…" : "← Загрузить более ранние"}
      </button>

      {dayGroups.length === 0 ? (
        <div className="rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground" data-testid="feed-empty">
          Записей в этом периоде нет
        </div>
      ) : (
        dayGroups.map(({ dateKey, label, appointments }) => (
          <FeedDayCard
            key={dateKey}
            dateKey={dateKey}
            label={label}
            appointments={appointments}
            timeZone={timeZone}
            onSelect={onSelect}
          />
        ))
      )}

      <button
        type="button"
        className="text-sm text-primary hover:underline text-center py-2"
        onClick={() => onLoadMore("future")}
        disabled={loading}
        data-testid="feed-load-future"
      >
        {loading ? "Загрузка…" : "Загрузить ещё →"}
      </button>
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

function RightPanelEmptyStub({ branchId, onCreateClick }: RightPanelEmptyStubProps) {
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
      <Button
        type="button"
        size="sm"
        onClick={onCreateClick}
        data-testid="right-panel-create-btn"
      >
        + Создать запись
      </Button>
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

  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [feedRangeFrom, setFeedRangeFrom] = useState<string>(() => {
    const { from } = visibleRange("feed", anchorDate, timeZone);
    return from;
  });
  const [feedRangeTo, setFeedRangeTo] = useState<string>(() => {
    const { to } = visibleRange("feed", anchorDate, timeZone);
    return to;
  });
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

  // ─── Feed load range ───────────────────────────────────────────────────────

  const loadMoreFeed = useCallback(
    (direction: "past" | "future") => {
      if (direction === "past") {
        const dt = DateTime.fromISO(feedRangeFrom, { zone: timeZone });
        setFeedRangeFrom(dt.minus({ days: 30 }).toISO() ?? feedRangeFrom);
      } else {
        const dt = DateTime.fromISO(feedRangeTo, { zone: timeZone });
        setFeedRangeTo(dt.plus({ days: 30 }).toISO() ?? feedRangeTo);
      }
    },
    [feedRangeFrom, feedRangeTo, timeZone],
  );

  // ─── Data loading ──────────────────────────────────────────────────────────

  const loadFeed = useCallback(
    (overrideView?: CalV26View, overrideAnchor?: string) => {
      const v = overrideView ?? view;
      const anchor = overrideAnchor ?? anchorDate;

      startTransition(async () => {
        try {
          let from: string;
          let to: string;

          if (v === "feed") {
            from = feedRangeFrom;
            to = feedRangeTo;
          } else {
            const range = visibleRange(v, anchor, timeZone);
            from = range.from;
            to = range.to;
          }

          // Map v26 view to API view param
          const apiView =
            v === "3days"
              ? "3days"
              : v === "weekgrid"
                ? "week"
                : v === "month"
                  ? "month"
                  : v === "day"
                    ? "day"
                    : "feed";

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
    [view, anchorDate, branchId, serviceId, timeZone, feedRangeFrom, feedRangeTo],
  );

  const loadKpis = useCallback(
    (v: CalV26View, anchor: string) => {
      // KPI скрыт в feed и day
      if (v === "feed" || v === "day") return;

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
  }, [view, anchorDate, branchId, serviceId, feedRangeFrom, feedRangeTo]);

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

  // ─── Calendar events ───────────────────────────────────────────────────────

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  const activeFilters = useMemo(
    () => ({ specialistId: null, branchId, roomId: null, serviceId }),
    [branchId, serviceId],
  );

  const currentTimeZone = data?.timeZone ?? timeZone;
  const workingBounds = data?.workingBounds;
  const { slotMinTime, slotMaxTime } = deriveSlotTimes(workingBounds);

  const calendarEvents = useMemo(() => {
    if (!data) return [];
    const layouts = computeAppointmentLayouts(data.events, data.timeZone);
    return data.events.map((event) => {
      if (event.kind === "working" || event.kind === "break") {
        return {
          id: `${event.kind}:${event.id}`,
          start: event.startAt,
          end: event.endAt,
          display: "background",
          classNames: [eventClassName(event)],
          editable: false,
          extendedProps: { kind: event.kind },
        };
      }
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
        // Для month-вида: только фамилия
        title: view === "month" ? eventLastName(event) : eventTitle(event),
        editable: !isCancelledAppointmentStatus(event.status),
        durationEditable: !isCancelledAppointmentStatus(event.status),
        startEditable: !isCancelledAppointmentStatus(event.status),
        classNames: [eventClassName(event)],
        extendedProps: {
          kind: event.kind,
          appointment: event,
          layout: layouts.get(event.id) ?? null,
        },
      };
    });
  }, [data, view]);

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
          dayCellClassNames: (arg: any) => {
            const today = DateTime.now().setZone(currentTimeZone).toISODate();
            const d = arg.date ? DateTime.fromJSDate(arg.date).setZone(currentTimeZone).toISODate() : null;
            return d === today ? ["fc-day-today-amber"] : [];
          },
        },
      };
    }
    return {};
  }, [view, currentTimeZone]);

  // ─── Render ────────────────────────────────────────────────────────────────

  const showKpi = view !== "feed" && view !== "day";
  const showPeriodNav = view !== "feed";

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      {/* Left: toolbar + kpi + calendar body */}
      <div className="min-w-0 flex-1 flex flex-col gap-3">
        {/* Toolbar (D1) */}
        <div
          className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} flex flex-wrap items-center gap-2`}
          data-testid="cal-toolbar"
        >
          {/* View switcher: 3 дня · Неделя · Месяц · Лента (без «День») */}
          <div className="flex gap-1" role="group" aria-label="Режим отображения">
            {(
              [
                { v: "3days" as const, label: "3 дня" },
                { v: "weekgrid" as const, label: "Неделя" },
                { v: "month" as const, label: "Месяц" },
                { v: "feed" as const, label: "Лента" },
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

          {/* Period nav: ◀ label ▶ — скрыто в feed */}
          {showPeriodNav ? (
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
          ) : null}

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

        {/* KPI row (D2) — hidden in feed and day */}
        {showKpi ? (
          <KpiRowTab kpis={kpis} kpisLoading={kpisLoading} />
        ) : null}

        {/* Calendar body */}
        {view === "feed" ? (
          // Лента (D4)
          <FeedView
            events={data?.events ?? []}
            anchorDate={anchorDate}
            timeZone={currentTimeZone}
            rangeFrom={feedRangeFrom}
            rangeTo={feedRangeTo}
            onSelect={(appt) => {
              setSelected(appt);
              setShowCreatePanel(false);
              onDeepLinkChange("appt", appt.id);
            }}
            onLoadMore={loadMoreFeed}
            loading={pending}
          />
        ) : (
          // FullCalendar (3days, weekgrid, month, day)
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <style>{`
              .fc-day-today-amber { background-color: #fff8e6 !important; }
              .fc-day-today.fc-day-today { background-color: #fff8e6 !important; }
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
              // Клик по числу в month → drill-down (D4)
              dayCellContent={(arg) => {
                if (view === "month") {
                  return (
                    <button
                      type="button"
                      className="fc-daygrid-day-number hover:underline cursor-pointer"
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
              eventDrop={onDrop}
              eventResize={onResize}
              eventDidMount={(arg) => {
                const appointment = arg.event.extendedProps?.appointment as
                  | CalendarAppointmentEvent
                  | undefined;
                const layout = arg.event.extendedProps?.layout as AppointmentLayout | null | undefined;
                if (!appointment || !layout) return;
                const harness = arg.el.parentElement;
                if (!harness || !harness.classList.contains("fc-timegrid-event-harness")) return;
                harness.style.insetInlineStart = `${layout.leftPercent}%`;
                harness.style.insetInlineEnd = `${100 - (layout.leftPercent + layout.widthPercent)}%`;
              }}
              eventContent={(info) => {
                const appointment = info.event.extendedProps?.appointment as
                  | CalendarAppointmentEvent
                  | undefined;
                if (appointment) {
                  if (view === "month") {
                    // Плашка = строка, только фамилия (D4)
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
  );
}
