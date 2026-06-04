"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { DateTime } from "luxon";
import { Badge } from "@/shared/ui/doctor/primitives/badge";
import { Button } from "@/shared/ui/doctor/primitives/button";
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from "@/shared/ui/doctor/doctorWorkspaceLayout";
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
import {
  appointmentStatusLabel,
  isCancelledAppointmentStatus,
} from "@/modules/booking-calendar/appointmentStatusLabels";
import { DoctorCalendarEventPanel } from "./DoctorCalendarEventPanel";
import { DoctorCalendarToolbarFilter } from "./DoctorCalendarToolbarFilter";
import { resolveCalendarCreateFieldValue } from "@/modules/booking-calendar/calendarCreateFieldMode";
import { patchAdminSetting } from "@/app/app/settings/patchAdminSetting";

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

type Props = {
  initialAnchorDate: string;
  initialView: CalendarViewMode;
  timeZone: string;
};

type AppointmentLayout = {
  leftPercent: number;
  widthPercent: number;
};

type CalendarMsg = {
  tone: "info" | "error";
  text: string;
};

function eventClassName(event: CalendarEvent): string {
  if (event.kind === "freeSlot") {
    return "bg-emerald-500/10 text-emerald-900 border-emerald-500/30 border-dashed";
  }
  if (event.kind === "block") {
    return "bg-muted text-muted-foreground border-border";
  }
  if (event.kind === "working") {
    return "bg-emerald-500/7";
  }
  if (event.kind === "break") {
    return "bg-slate-500/10";
  }
  if (isCancelledAppointmentStatus(event.status)) {
    return "bg-destructive/10 text-destructive border-destructive/30 line-through";
  }
  if (event.status === "awaiting_payment" || event.prepaymentPending) {
    return "bg-amber-500/15 text-amber-900 dark:text-amber-100 border-amber-500/40";
  }
  if (event.packageUsageRef || event.packageTitle) {
    return "bg-violet-500/15 text-violet-900 dark:text-violet-100 border-violet-500/40";
  }
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

function toUiError(error: string | undefined): string {
  if (!error) return "Ошибка календаря";
  if (error === "external_slot_taken") return "Время уже занято во внешней записи. Обновите календарь.";
  if (error === "slot_overlap") return "Слот уже занят в нашем расписании.";
  if (error === "lifecycle_unavailable") return "Сервис переноса временно недоступен.";
  if (error === "not_found") return "Запись не найдена.";
  if (error === "invalid_body") return "Некорректные данные.";
  return error;
}

function periodLabel(view: CalendarViewMode, anchorDate: string, zone: string): string {
  const anchor = DateTime.fromISO(anchorDate, { zone });
  if (view === "day") return anchor.setLocale("ru").toFormat("cccc, d LLLL yyyy");
  if (view === "month") return anchor.setLocale("ru").toFormat("LLLL yyyy");
  const start = anchor.startOf("week");
  const end = anchor.endOf("week");
  return `${start.setLocale("ru").toFormat("d LLLL")} - ${end.setLocale("ru").toFormat("d LLLL yyyy")}`;
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
    active.forEach((e, idx) => {
      map.set(e.id, { leftPercent: idx * activeWidth, widthPercent: activeWidth });
    });
    const cancelledWidth = 25 / cancelled.length;
    cancelled.forEach((e, idx) => {
      map.set(e.id, { leftPercent: 75 + idx * cancelledWidth, widthPercent: cancelledWidth });
    });
  }
  return map;
}

function buildQuery(params: Record<string, string | null | undefined>): string {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v) sp.set(k, v);
  }
  return sp.toString();
}

export function DoctorBookingCalendarClient({ initialAnchorDate, initialView, timeZone }: Props) {
  const [view, setView] = useState<CalendarViewMode>(initialView);
  const [anchorDate, setAnchorDate] = useState(initialAnchorDate);
  const [specialistId, setSpecialistId] = useState<string | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<CalendarMsg | null>(null);
  const [pending, startTransition] = useTransition();
  const [showWorkingHours, setShowWorkingHours] = useState(true);

  const load = useCallback(() => {
    startTransition(async () => {
      const qs = buildQuery({
        view,
        date: anchorDate,
        specialistId,
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
      setShowWorkingHours(json.showWorkingHours !== false);
      setSpecialistId((prev) =>
        resolveCalendarCreateFieldValue(json.filters.specialists, null, prev) ??
          json.filters.specialists[0]?.id ??
          null,
      );
      setBranchId((prev) => resolveCalendarCreateFieldValue(json.filters.branches, null, prev));
      setServiceId((prev) => resolveCalendarCreateFieldValue(json.filters.services, null, prev));
    });
  }, [anchorDate, branchId, serviceId, specialistId, view]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
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
  }, [load]);

  function shiftAnchor(deltaDays: number) {
    const unit =
      view === "month"
        ? { months: deltaDays > 0 ? 1 : -1 }
        : view === "week"
          ? { days: deltaDays * 7 }
          : { days: deltaDays };
    const next = DateTime.fromISO(anchorDate, { zone: timeZone }).plus(unit).toISODate();
    if (next) setAnchorDate(next);
  }

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  const activeFilters = useMemo(
    () => ({
      specialistId,
      branchId,
      roomId: null,
      serviceId,
    }),
    [branchId, serviceId, specialistId],
  );

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
        title: eventTitle(event),
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
  }, [data]);

  const currentTimeZone = data?.timeZone ?? timeZone;
  const currentAnchor = data?.anchorDate ?? anchorDate;
  const currentView = data?.view ?? view;

  const performReschedule = useCallback(
    async (appointment: CalendarAppointmentEvent, startAt: string, endAt: string): Promise<boolean> => {
      const durationMinutes = Math.max(
        1,
        Math.round((new Date(endAt).getTime() - new Date(startAt).getTime()) / 60_000),
      );
      const res = await fetch(`${API_BASE}/appointments/${encodeURIComponent(appointment.id)}/manual-reschedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newStartAt: startAt, newEndAt: endAt, durationMinutes }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !json.ok) {
        setMessage({ tone: "error", text: toUiError(json.error) });
        if (json.error === "external_slot_taken") {
          load();
        }
        return false;
      }
      setMessage({ tone: "info", text: "Перенесено" });
      await load();
      return true;
    },
    [load],
  );

  const onDrop = useCallback(
    async (arg: any) => {
      const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
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
      const appointment = arg.event.extendedProps?.appointment as CalendarAppointmentEvent | undefined;
      if (!appointment) return arg.revert();
      const nextStart = arg.event.start?.toISOString();
      const nextEnd = arg.event.end?.toISOString();
      if (!nextStart || !nextEnd) return arg.revert();
      const ok = await performReschedule(appointment, nextStart, nextEnd);
      if (!ok) arg.revert();
    },
    [performReschedule],
  );

  const onToggleWorkingHours = useCallback(async () => {
    const next = !showWorkingHours;
    const ok = await patchAdminSetting("booking_calendar_show_working_hours", next);
    if (!ok) {
      setMessage({ tone: "error", text: "Не удалось сохранить настройку." });
      return;
    }
    setShowWorkingHours(next);
    setMessage({ tone: "info", text: next ? "Рабочее время включено." : "Рабочее время скрыто." });
    await load();
  }, [load, showWorkingHours]);

  return (
    <div className="flex flex-col gap-4 lg:flex-row">
      <div className="min-w-0 flex-1">
        <div className={`${DOCTOR_CATALOG_STICKY_BAR_CLASS} mb-3 flex flex-wrap items-center gap-2`}>
          <div className="flex gap-1">
            {(["day", "week", "month"] as const).map((v) => (
              <Button
                key={v}
                type="button"
                size="sm"
                variant={view === v ? "default" : "outline"}
                onClick={() => setView(v)}
              >
                {v === "day" ? "День" : v === "week" ? "Неделя" : "Месяц"}
              </Button>
            ))}
          </div>
          <Badge variant="outline">{periodLabel(currentView, currentAnchor, currentTimeZone)}</Badge>
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(-1)}>
              ←
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(1)}>
              →
            </Button>
          </div>
          <DoctorCalendarToolbarFilter
            noneLabel="Филиал"
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
          <Button
            type="button"
            size="sm"
            variant={showWorkingHours ? "default" : "outline"}
            onClick={onToggleWorkingHours}
          >
            Рабочее время
          </Button>
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={load}>
            Обновить
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}
        {message ? (
          <p className={`text-sm ${message.tone === "error" ? "text-destructive" : "text-muted-foreground"}`}>
            {message.text}
          </p>
        ) : null}

        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <FullCalendar
            plugins={[dayGridPlugin, timeGridPlugin, interactionPlugin]}
            locale={ruLocale}
            key={`${currentView}:${currentAnchor}:${branchId ?? "all"}:${serviceId ?? "all"}`}
            initialView={
              currentView === "day"
                ? "timeGridDay"
                : currentView === "week"
                  ? "timeGridWeek"
                  : "dayGridMonth"
            }
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
      </div>

      <aside className="w-full shrink-0 lg:w-80">
        <DoctorCalendarEventPanel
          apiBase={API_BASE}
          selected={selected}
          timeZone={data?.timeZone ?? timeZone}
          filterMeta={filters}
          activeFilters={activeFilters}
          onClose={() => setSelected(null)}
          onChanged={() => {
            setSelected(null);
            load();
          }}
        />
      </aside>
    </div>
  );
}
