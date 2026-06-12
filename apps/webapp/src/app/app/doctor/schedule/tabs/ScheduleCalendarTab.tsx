"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
import { DoctorCalendarEventPanel } from "../../calendar/DoctorCalendarEventPanel";
import { DoctorCalendarToolbarFilter } from "../../calendar/DoctorCalendarToolbarFilter";
import { resolveCalendarCreateFieldValue } from "@/modules/booking-calendar/calendarCreateFieldMode";
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
} from "@/modules/booking-calendar/appointmentStatusLabels";
import FullCalendar from "@fullcalendar/react";
import dayGridPlugin from "@fullcalendar/daygrid";
import timeGridPlugin from "@fullcalendar/timegrid";
import interactionPlugin from "@fullcalendar/interaction";
import ruLocale from "@fullcalendar/core/locales/ru";
import type {
  CalendarAppointmentEvent,
  CalendarEvent,
  CalendarFilterMeta,
  CalendarViewMode,
} from "@/modules/booking-calendar/types";
import type { ScheduleTabProps } from "../scheduleTabRegistry";

const API_BASE = "/api/doctor/booking-engine";

type CalendarResponse = {
  ok: boolean;
  view: CalendarViewMode;
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource?: "canonical";
  showWorkingHours: boolean;
  error?: string;
};

type AppointmentLayout = {
  leftPercent: number;
  widthPercent: number;
};

/** Нормализует view из deep-link params; fallback — weeklist (главный рабочий режим по вайрфрейму). */
function resolveView(raw: string | undefined): CalendarViewMode {
  if (raw === "day" || raw === "week" || raw === "weeklist" || raw === "month") return raw;
  return "weeklist";
}

function resolveAnchorDate(raw: string | undefined, timeZone: string): string {
  if (raw && /^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw;
  return DateTime.now().setZone(timeZone).toISODate() ?? "2026-01-01";
}

function periodLabel(view: CalendarViewMode, anchorDate: string, zone: string): string {
  const anchor = DateTime.fromISO(anchorDate, { zone });
  if (view === "day") return anchor.setLocale("ru").toFormat("cccc, d LLLL yyyy");
  if (view === "month") return anchor.setLocale("ru").toFormat("LLLL yyyy");
  const start = anchor.startOf("week");
  const end = anchor.endOf("week");
  return `${start.setLocale("ru").toFormat("d LLLL")} – ${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

function eventClassName(event: CalendarEvent): string {
  if (event.kind === "freeSlot") return "bg-emerald-500/10 text-emerald-900 border-emerald-500/30 border-dashed";
  if (event.kind === "block") return "bg-muted text-muted-foreground border-border";
  if (event.kind === "working") return "bg-emerald-500/7";
  if (event.kind === "break") return "bg-slate-500/10";
  if (isCancelledAppointmentStatus(event.status)) return "bg-destructive/10 text-destructive border-destructive/30 line-through";
  if (event.status === "awaiting_payment" || event.prepaymentPending) return "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/40";
  if (event.packageUsageRef || event.packageTitle) return "bg-violet-500/15 text-violet-900 dark:text-violet-100 border-violet-500/40";
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

function computeAppointmentLayouts(events: CalendarEvent[], zone: string): Map<string, AppointmentLayout> {
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
    active.forEach((e, idx) => { map.set(e.id, { leftPercent: idx * activeWidth, widthPercent: activeWidth }); });
    const cancelledWidth = 25 / cancelled.length;
    cancelled.forEach((e, idx) => { map.set(e.id, { leftPercent: 75 + idx * cancelledWidth, widthPercent: cancelledWidth }); });
  }
  return map;
}

// ---------------------------------------------------------------------------
// WeekList sub-components
// ---------------------------------------------------------------------------

function buildWeekDays(anchorDate: string, timeZone: string): string[] {
  const anchor = DateTime.fromISO(anchorDate, { zone: timeZone });
  const monday = anchor.startOf("week");
  return Array.from({ length: 7 }, (_, i) => monday.plus({ days: i }).toISODate() ?? "");
}

type DayGroup = { dateKey: string; label: string; appointments: CalendarAppointmentEvent[] };

function groupByDay(events: CalendarEvent[], days: string[], timeZone: string): DayGroup[] {
  return days.reduce<DayGroup[]>((acc, day) => {
    const anchor = DateTime.fromISO(day, { zone: timeZone });
    const appointments = events
      .filter((e): e is CalendarAppointmentEvent =>
        e.kind === "appointment" &&
        DateTime.fromISO(e.startAt).setZone(timeZone).toISODate() === day,
      )
      .sort((a, b) => (a.startAt < b.startAt ? -1 : 1));
    if (appointments.length > 0) {
      acc.push({
        dateKey: day,
        label: anchor.setLocale("ru").toFormat("cccc, d LLLL"),
        appointments,
      });
    }
    return acc;
  }, []);
}

function formatTime(iso: string, zone: string): string {
  return DateTime.fromISO(iso).setZone(zone).toFormat("HH:mm");
}

type WeekListViewProps = {
  events: CalendarEvent[];
  anchorDate: string;
  timeZone: string;
  onSelect: (appt: CalendarAppointmentEvent) => void;
};

function WeekListView({ events, anchorDate, timeZone, onSelect }: WeekListViewProps) {
  const days = buildWeekDays(anchorDate, timeZone);
  const groups = groupByDay(events, days, timeZone);

  if (groups.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground" data-testid="weeklist-empty">
        На этой неделе записей нет.
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3" data-testid="weeklist-view">
      {groups.map(({ dateKey, label, appointments }) => (
        <div key={dateKey} className="rounded-xl border border-border bg-card p-3" data-testid={`weeklist-day-${dateKey}`}>
          <p className="mb-2 text-sm font-semibold text-foreground capitalize">{label}</p>
          <div className="flex flex-col gap-1.5">
            {appointments.map((appt) => (
              <button
                key={appt.id}
                type="button"
                onClick={() => onSelect(appt)}
                className="flex w-full items-center gap-3 rounded-md border border-border bg-background px-3 py-2 text-left text-sm hover:bg-muted"
                data-testid={`weeklist-appt-${appt.id}`}
              >
                <span className="shrink-0 font-semibold tabular-nums text-foreground">
                  {formatTime(appt.startAt, timeZone)}–{formatTime(appt.endAt, timeZone)}
                </span>
                <span className="min-w-0 truncate text-foreground">{appt.patientName ?? "Запись"}</span>
                {appt.serviceTitle ? (
                  <span className="min-w-0 shrink truncate text-xs text-muted-foreground">{appt.serviceTitle}</span>
                ) : null}
                <Badge variant="outline" className="ml-auto shrink-0 text-[10px]">
                  {appointmentStatusLabel(appt.status)}
                </Badge>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScheduleCalendarTab — главный компонент
// ---------------------------------------------------------------------------

/** Таб «Календарь записей» раздела «Расписание». */
export function ScheduleCalendarTab({ deepLinkParams, onDeepLinkChange, isActive }: ScheduleTabProps) {
  // Resolve state from deep-link params (URL-sync через шелл)
  const [timeZone] = useState("Europe/Moscow"); // populated by SSR data if needed; default safe
  const [view, setViewState] = useState<CalendarViewMode>(() => resolveView(deepLinkParams.view));
  const [anchorDate, setAnchorDateState] = useState<string>(() =>
    resolveAnchorDate(deepLinkParams.date, timeZone),
  );
  const [branchId, setBranchIdState] = useState<string | null>(deepLinkParams.location ?? null);
  const [serviceId, setServiceIdState] = useState<string | null>(deepLinkParams.service ?? null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showWorkingHours, setShowWorkingHours] = useState(true);
  const [pending, startTransition] = useTransition();

  // Sync state → deep-link
  const setView = useCallback(
    (v: CalendarViewMode) => {
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

  // Note: deepLinkParams changes from shell (popstate) are intentionally NOT reconciled here.
  // This tab is the owner of view/date/location/service state and pushes changes via onDeepLinkChange.
  // On first mount the state is correctly initialized from deepLinkParams (see useState initialisers above).

  const load = useCallback(() => {
    startTransition(async () => {
      const qs = buildQuery({ view: view === "weeklist" ? "week" : view, date: anchorDate, branchId, serviceId });
      const res = await fetch(`${API_BASE}/calendar?${qs}`);
      const raw = await res.text();
      if (!raw.trim()) { setError(res.ok ? "load_failed" : `load_failed_${res.status}`); return; }
      let json: CalendarResponse;
      try { json = JSON.parse(raw) as CalendarResponse; } catch { setError("load_failed"); return; }
      if (!res.ok || !json.ok) { setError(json.error ?? "load_failed"); return; }
      setData(json);
      setError(null);
      setShowWorkingHours(json.showWorkingHours !== false);
      setBranchIdState((prev) => resolveCalendarCreateFieldValue(json.filters.branches, null, prev));
      setServiceIdState((prev) => resolveCalendarCreateFieldValue(json.filters.services, null, prev));
    });
  }, [anchorDate, branchId, serviceId, view]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (!isActive) return;
    const id = window.setInterval(() => { if (document.visibilityState === "visible") load(); }, 30_000);
    const onVisibility = () => { if (document.visibilityState === "visible") load(); };
    document.addEventListener("visibilitychange", onVisibility);
    return () => { window.clearInterval(id); document.removeEventListener("visibilitychange", onVisibility); };
  }, [load, isActive]);

  function shiftAnchor(deltaDays: number) {
    const unit =
      view === "month"
        ? { months: deltaDays > 0 ? 1 : -1 }
        : view === "week" || view === "weeklist"
          ? { days: deltaDays * 7 }
          : { days: deltaDays };
    const next = DateTime.fromISO(anchorDate, { zone: timeZone }).plus(unit).toISODate();
    if (next) setAnchorDate(next);
  }

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  const activeFilters = useMemo(
    () => ({ specialistId: null, branchId, roomId: null, serviceId }),
    [branchId, serviceId],
  );

  const currentTimeZone = data?.timeZone ?? timeZone;
  const currentAnchor = data?.anchorDate ?? anchorDate;
  const currentView = view; // we manage view ourselves in this tab

  const calendarEvents = useMemo(() => {
    if (!data) return [];
    const layouts = computeAppointmentLayouts(data.events, data.timeZone);
    return data.events.map((event) => {
      if (event.kind === "working" || event.kind === "break") {
        return { id: `${event.kind}:${event.id}`, start: event.startAt, end: event.endAt, display: "background", classNames: [eventClassName(event)], editable: false, extendedProps: { kind: event.kind } };
      }
      if (event.kind === "block") {
        return { id: `block:${event.id}`, start: event.startAt, end: event.endAt, title: eventTitle(event), editable: false, classNames: [eventClassName(event)], extendedProps: { kind: event.kind, block: event } };
      }
      if (event.kind === "freeSlot") {
        return { id: `free:${event.id}`, start: event.startAt, end: event.endAt, title: eventTitle(event), editable: false, classNames: [eventClassName(event)], extendedProps: { kind: event.kind } };
      }
      return {
        id: event.id,
        start: event.startAt,
        end: event.endAt,
        title: eventTitle(event),
        editable: !isCancelledAppointmentStatus(event.status),
        durationEditable: !isCancelledAppointmentStatus(event.status),
        startEditable: !isCancelledAppointmentStatus(event.status),
        classNames: [eventClassName(event)],
        extendedProps: { kind: event.kind, appointment: event, layout: layouts.get(event.id) ?? null },
      };
    });
  }, [data]);

  const onToggleWorkingHours = useCallback(async () => {
    const next = !showWorkingHours;
    const ok = await patchAdminSetting("booking_calendar_show_working_hours", next);
    if (!ok) return;
    setShowWorkingHours(next);
    await load();
  }, [load, showWorkingHours]);

  const performReschedule = useCallback(
    async (appointment: CalendarAppointmentEvent, startAt: string, endAt: string): Promise<boolean> => {
      const durationMinutes = Math.max(1, Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000));
      const res = await fetch(`${API_BASE}/appointments/${encodeURIComponent(appointment.id)}/manual-reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStartAt: startAt, newEndAt: endAt, durationMinutes }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) { load(); return false; }
      await load();
      return true;
    },
    [load],
  );

  const onDrop = useCallback(async (arg: any) => {
    const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
    if (!appointment) return arg.revert();
    const nextStart = arg.event.start?.toISOString();
    const nextEnd = arg.event.end?.toISOString();
    if (!nextStart || !nextEnd) return arg.revert();
    const ok = await performReschedule(appointment, nextStart, nextEnd);
    if (!ok) arg.revert();
  }, [performReschedule]);

  const onResize = useCallback(async (arg: any) => {
    const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
    if (!appointment) return arg.revert();
    const nextStart = arg.event.start?.toISOString();
    const nextEnd = arg.event.end?.toISOString();
    if (!nextStart || !nextEnd) return arg.revert();
    const ok = await performReschedule(appointment, nextStart, nextEnd);
    if (!ok) arg.revert();
  }, [performReschedule]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        {/* Toolbar */}
        <div className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} mb-3 flex flex-wrap items-center gap-2`}>
          {/* View switcher */}
          <div className="flex gap-1" role="group" aria-label="Режим отображения">
            {(["day", "week", "weeklist", "month"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={currentView === v ? "default" : "outline"}
                onClick={() => setView(v)}
                data-testid={`view-btn-${v}`}
              >
                {v === "day" ? "День" : v === "week" ? "Неделя · сетка" : v === "weeklist" ? "Неделя · лента" : "Месяц"}
              </Button>
            ))}
          </div>

          {/* Period badge + nav */}
          <Badge variant="outline" data-testid="period-label">
            {periodLabel(currentView, currentAnchor, currentTimeZone)}
          </Badge>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(-1)} aria-label="Предыдущий период">◀</Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(1)} aria-label="Следующий период">▶</Button>
          </div>

          {/* Location / Service filters */}
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

          {currentView !== "weeklist" ? (
            <Button
              type="button"
              size="sm"
              variant={showWorkingHours ? "default" : "outline"}
              onClick={onToggleWorkingHours}
            >
              Рабочее время
            </Button>
          ) : null}

          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={load}>
            Обновить
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {/* Calendar body */}
        {currentView === "weeklist" ? (
          <WeekListView
            events={data?.events ?? []}
            anchorDate={currentAnchor}
            timeZone={currentTimeZone}
            onSelect={(appt) => {
              setSelected(appt);
              onDeepLinkChange("appt", appt.id);
            }}
          />
        ) : (
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            <FullCalendar
              plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
              locale={ruLocale}
              key={`${currentView}:${currentAnchor}:${branchId ?? "all"}:${serviceId ?? "all"}`}
              initialView={currentView === "day" ? "timeGridDay" : currentView === "week" ? "timeGridWeek" : "dayGridMonth"}
              initialDate={currentAnchor}
              timeZone={currentTimeZone}
              events={calendarEvents}
              headerToolbar={false}
              editable
              eventDurationEditable
              eventStartEditable
              nowIndicator
              dayMaxEvents
              height="auto"
              slotMinTime="06:00:00"
              slotMaxTime="23:00:00"
              longPressDelay={450}
              eventLongPressDelay={450}
              selectLongPressDelay={450}
              eventClick={(arg) => {
                const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
                if (!appointment) return;
                setSelected(appointment);
                onDeepLinkChange("appt", appointment.id);
              }}
              eventDrop={onDrop}
              eventResize={onResize}
              eventDidMount={(arg) => {
                const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
                const layout = arg.event.extendedProps?.layout as AppointmentLayout | null | undefined;
                if (!appointment || !layout) return;
                const harness = arg.el.parentElement;
                if (!harness || !harness.classList.contains("fc-timegrid-event-harness")) return;
                harness.style.insetInlineStart = `${layout.leftPercent}%`;
                harness.style.insetInlineEnd = `${100 - (layout.leftPercent + layout.widthPercent)}%`;
              }}
              eventContent={(info) => {
                const appointment = info.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
                if (appointment) {
                  return (
                    <div className="overflow-hidden px-1 py-0.5 text-[11px] leading-tight">
                      <div className="truncate font-medium">{eventTitle(appointment)}</div>
                      <div className="truncate opacity-80">{appointmentStatusLabel(appointment.status)}</div>
                    </div>
                  );
                }
                return <div className="truncate px-1 py-0.5 text-[11px]">{info.event.title}</div>;
              }}
            />
          </div>
        )}
      </div>

      {/* Right panel: appt detail + create */}
      <aside className="w-full shrink-0 lg:w-80">
        <DoctorCalendarEventPanel
          apiBase={API_BASE}
          selected={selected}
          timeZone={currentTimeZone}
          filterMeta={filters}
          activeFilters={activeFilters}
          onClose={() => {
            setSelected(null);
            onDeepLinkChange("appt", null);
          }}
          onChanged={() => {
            setSelected(null);
            onDeepLinkChange("appt", null);
            load();
          }}
        />
      </aside>
    </div>
  );
}
