"use client";

import { useCallback, useEffect, useMemo, useState, useTransition, type CSSProperties } from "react";
import { DateTime } from "luxon";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { DOCTOR_CATALOG_STICKY_BAR_CLASS } from "@/shared/ui/doctorWorkspaceLayout";
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

const API_BASE = "/api/doctor/booking-engine";

type CalendarResponse = {
  ok: boolean;
  view: CalendarViewMode;
  anchorDate: string;
  timeZone: string;
  events: CalendarEvent[];
  filters: CalendarFilterMeta;
  readSource?: "rubitime_legacy" | "canonical";
  freeSlotsEnabled?: boolean;
  error?: string;
};

type Props = {
  initialAnchorDate: string;
  initialView: CalendarViewMode;
  timeZone: string;
};

const DEFAULT_HOUR_START = 7;
const DEFAULT_HOUR_END = 21;

function formatDayHeader(isoDate: string, timeZone: string): string {
  return DateTime.fromISO(isoDate, { zone: timeZone }).toFormat("ccc dd.MM");
}

function eventStyle(event: CalendarEvent): string {
  if (event.kind === "freeSlot") {
    return "bg-emerald-500/10 text-emerald-800 dark:text-emerald-100 border-emerald-500/30 border-dashed";
  }
  if (event.kind === "block") {
    return "bg-muted text-muted-foreground border-border";
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
  if (event.kind === "freeSlot") {
    return "Свободно";
  }
  if (event.kind === "block") {
    return event.title ?? "Блокировка";
  }
  const parts = [event.patientName ?? "Запись", event.serviceTitle].filter(Boolean);
  return parts.join(" · ");
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
  const [roomId, setRoomId] = useState<string | null>(null);
  const [serviceId, setServiceId] = useState<string | null>(null);
  const [data, setData] = useState<CalendarResponse | null>(null);
  const [selected, setSelected] = useState<CalendarAppointmentEvent | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const [freeSlotsEnabled, setFreeSlotsEnabled] = useState(true);

  const load = useCallback(() => {
    startTransition(async () => {
      const qs = buildQuery({
        view,
        date: anchorDate,
        specialistId,
        branchId,
        roomId,
        serviceId,
        includeFreeSlots:
          freeSlotsEnabled && specialistId && branchId && serviceId ? "1" : undefined,
      });
      const res = await fetch(`${API_BASE}/calendar?${qs}`);
      const json = (await res.json()) as CalendarResponse;
      if (!json.ok) {
        setError(json.error ?? "load_failed");
        return;
      }
      setData(json);
      setError(null);
      setFreeSlotsEnabled(json.freeSlotsEnabled !== false);
      setSpecialistId((prev) =>
        resolveCalendarCreateFieldValue(json.filters.specialists, null, prev),
      );
      setBranchId((prev) => resolveCalendarCreateFieldValue(json.filters.branches, null, prev));
      setRoomId((prev) => resolveCalendarCreateFieldValue(json.filters.rooms, null, prev));
      setServiceId((prev) => resolveCalendarCreateFieldValue(json.filters.services, null, prev));
    });
  }, [anchorDate, branchId, freeSlotsEnabled, roomId, serviceId, specialistId, view]);

  useEffect(() => {
    load();
  }, [load]);

  const days = useMemo(() => {
    if (!data) return [];
    const anchor = DateTime.fromISO(data.anchorDate, { zone: data.timeZone });
    if (data.view === "day") {
      return [anchor.startOf("day")];
    }
    if (data.view === "month") {
      const start = anchor.startOf("month").startOf("week");
      const end = anchor.endOf("month").endOf("week");
      const out: DateTime[] = [];
      let cur = start;
      while (cur <= end) {
        out.push(cur);
        cur = cur.plus({ days: 1 });
      }
      return out;
    }
    const weekStart = anchor.startOf("week");
    return Array.from({ length: 7 }, (_, i) => weekStart.plus({ days: i }));
  }, [data]);

  function shiftAnchor(deltaDays: number) {
    const unit = view === "month" ? { months: deltaDays > 0 ? 1 : -1 } : { days: deltaDays };
    const next = DateTime.fromISO(anchorDate, { zone: timeZone }).plus(unit).toISODate();
    if (next) setAnchorDate(next);
  }

  const filters = data?.filters ?? { specialists: [], branches: [], rooms: [], services: [] };

  const activeFilters = useMemo(
    () => ({
      specialistId,
      branchId,
      roomId,
      serviceId,
    }),
    [branchId, roomId, serviceId, specialistId],
  );

  const { hourStart, hourEnd } = useMemo(() => {
    if (!data || data.view === "month") {
      return { hourStart: DEFAULT_HOUR_START, hourEnd: DEFAULT_HOUR_END };
    }
    let minH = DEFAULT_HOUR_START;
    let maxH = DEFAULT_HOUR_END;
    for (const event of data.events) {
      const start = DateTime.fromISO(event.startAt).setZone(data.timeZone);
      const end = DateTime.fromISO(event.endAt).setZone(data.timeZone);
      minH = Math.min(minH, start.hour);
      maxH = Math.max(maxH, end.hour + (end.minute > 0 ? 1 : 0));
    }
    return {
      hourStart: Math.max(6, minH - 1),
      hourEnd: Math.min(23, Math.max(maxH + 1, DEFAULT_HOUR_END)),
    };
  }, [data]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    if (!data) return map;
    for (const event of data.events) {
      const start = DateTime.fromISO(event.startAt).setZone(data.timeZone).startOf("day");
      const end = DateTime.fromISO(event.endAt).setZone(data.timeZone).startOf("day");
      let cur = start;
      while (cur <= end) {
        const key = cur.toISODate();
        if (!key) break;
        const list = map.get(key) ?? [];
        list.push(event);
        map.set(key, list);
        cur = cur.plus({ days: 1 });
      }
    }
    return map;
  }, [data]);

  function placementStyle(event: CalendarEvent, dayStart: DateTime): CSSProperties | null {
    if (!data || data.view === "month") return null;
    const start = DateTime.fromISO(event.startAt).setZone(data.timeZone);
    const end = DateTime.fromISO(event.endAt).setZone(data.timeZone);
    const gridStart = dayStart.plus({ hours: hourStart });
    const gridEnd = dayStart.plus({ hours: hourEnd });
    if (end <= gridStart || start >= gridEnd) return null;
    const clampStart = start < gridStart ? gridStart : start;
    const clampEnd = end > gridEnd ? gridEnd : end;
    const topMinutes = clampStart.diff(gridStart, "minutes").minutes;
    const heightMinutes = Math.max(clampEnd.diff(clampStart, "minutes").minutes, 15);
    const totalMinutes = (hourEnd - hourStart) * 60;
    return {
      top: `${(topMinutes / totalMinutes) * 100}%`,
      height: `${(heightMinutes / totalMinutes) * 100}%`,
    };
  }

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
          <div className="flex gap-1">
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(-1)}>
              ←
            </Button>
            <Button type="button" size="sm" variant="outline" onClick={() => shiftAnchor(1)}>
              →
            </Button>
          </div>
          <DoctorCalendarToolbarFilter
            noneLabel="Специалист"
            options={filters.specialists}
            value={specialistId}
            onChange={setSpecialistId}
          />
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
          <DoctorCalendarToolbarFilter
            noneLabel="Кабинет"
            options={filters.rooms}
            value={roomId}
            onChange={setRoomId}
          />
          <Button type="button" size="sm" variant="outline" disabled={pending} onClick={load}>
            Обновить
          </Button>
        </div>

        {error ? <p className="text-sm text-destructive">{error}</p> : null}

        {data?.view === "month" ? (
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const key = day.toISODate()!;
              const dayEvents = eventsByDay.get(key) ?? [];
              const inMonth = day.month === DateTime.fromISO(data.anchorDate, { zone: data.timeZone }).month;
              return (
                <button
                  key={key}
                  type="button"
                  className={`min-h-24 rounded-lg border p-1 text-left ${inMonth ? "border-border bg-card" : "border-transparent bg-muted/30 opacity-60"}`}
                  onClick={() => {
                    setAnchorDate(key);
                    setView("day");
                  }}
                >
                  <span className="text-xs font-medium">{day.day}</span>
                  <div className="mt-1 space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div key={`${ev.kind}-${ev.id}`} className={`truncate rounded px-1 text-[10px] border ${eventStyle(ev)}`}>
                        {eventTitle(ev)}
                      </div>
                    ))}
                    {dayEvents.length > 3 ? (
                      <span className="text-[10px] text-muted-foreground">+{dayEvents.length - 3}</span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-border">
            <div
              className="grid min-w-[640px]"
              style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(0, 1fr))` }}
            >
              <div className="border-b border-border bg-muted/40" />
              {days.map((day) => (
                <div key={day.toISODate()} className="border-b border-l border-border bg-muted/40 px-1 py-1 text-center text-xs font-medium">
                  {formatDayHeader(day.toISODate()!, data?.timeZone ?? timeZone)}
                </div>
              ))}
              <div className="relative border-r border-border bg-muted/20">
                {Array.from({ length: hourEnd - hourStart }, (_, i) => (
                  <div key={i} className="h-12 border-b border-border/50 pr-1 text-right text-[10px] text-muted-foreground">
                    {hourStart + i}:00
                  </div>
                ))}
              </div>
              {days.map((day) => {
                const dayEvents = eventsByDay.get(day.toISODate()!) ?? [];
                return (
                  <div key={day.toISODate()} className="relative border-l border-border">
                    {Array.from({ length: hourEnd - hourStart }, (_, i) => (
                      <div key={i} className="h-12 border-b border-border/40" />
                    ))}
                    {dayEvents.map((ev) => {
                      const style = placementStyle(ev, day.startOf("day"));
                      if (!style) return null;
                      const zClass = ev.kind === "freeSlot" ? "z-[5]" : "z-10";
                      return (
                        <button
                          key={`${ev.kind}-${ev.id}-${day.toISODate()}`}
                          type="button"
                          className={`absolute inset-x-0.5 ${zClass} overflow-hidden rounded border px-1 py-0.5 text-left text-[10px] leading-tight ${eventStyle(ev)}`}
                          style={style}
                          onClick={() => {
                            if (ev.kind === "appointment") setSelected(ev);
                          }}
                        >
                          <span className="block truncate font-medium">{eventTitle(ev)}</span>
                          {ev.kind === "appointment" ? (
                            <span className="block truncate opacity-80">{appointmentStatusLabel(ev.status)}</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <aside className="w-full shrink-0 lg:w-80">
        <DoctorCalendarEventPanel
          apiBase={API_BASE}
          selected={selected}
          timeZone={data?.timeZone ?? timeZone}
          filterMeta={filters}
          activeFilters={activeFilters}
          legacyReadOnly={data?.readSource === "rubitime_legacy"}
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
