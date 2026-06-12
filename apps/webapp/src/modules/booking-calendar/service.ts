import type { BookingSchedulingPort, ScheduleBlockRecord } from "@/modules/booking-scheduling/ports";
import {
  localDateKey,
  pickWorkingHours,
  workingIntervalsForDate,
  type WorkingHoursRow,
} from "@/modules/booking-scheduling/computeSlots";
import { DateTime } from "luxon";
import type { BookingCalendarPort, BookingCalendarService } from "./ports";
import type {
  CalendarAggregate,
  CalendarBreakEvent,
  CalendarBlockEvent,
  CalendarFilters,
  CalendarWorkingEvent,
  WorkingBounds,
} from "./types";

type Deps = {
  calendarPort: BookingCalendarPort;
  listScheduleBlocks: (input: {
    organizationId: string;
    rangeStart: string;
    rangeEnd: string;
  }) => Promise<ScheduleBlockRecord[]>;
  schedulingPort?: BookingSchedulingPort;
  resolveShowWorkingHours?: () => Promise<boolean>;
};

function mapBlock(block: ScheduleBlockRecord): CalendarBlockEvent {
  return {
    kind: "block",
    id: block.id,
    startAt: block.startAt,
    endAt: block.endAt,
    blockType: block.blockType,
    title: block.title,
    specialistId: block.specialistId,
    branchId: block.branchId,
    roomId: block.roomId,
  };
}

function matchesOptionalFilter(value: string | null, filter: string | null | undefined): boolean {
  if (!filter) return true;
  return value === filter;
}

function enumerateDateKeys(rangeStart: string, rangeEnd: string, timeZone: string): string[] {
  const startKey = localDateKey(rangeStart, timeZone);
  const endKey = localDateKey(rangeEnd, timeZone);
  const out: string[] = [];
  let cursor = DateTime.fromISO(startKey, { zone: "UTC" });
  const end = DateTime.fromISO(endKey, { zone: "UTC" });
  while (cursor <= end) {
    out.push(cursor.toISODate()!);
    cursor = cursor.plus({ days: 1 });
  }
  return out;
}

function mapWorkingRows(rows: Awaited<ReturnType<BookingSchedulingPort["listWorkingHours"]>>): WorkingHoursRow[] {
  return rows.map((r) => ({
    weekday: r.weekday,
    startMinute: r.startMinute,
    endMinute: r.endMinute,
  }));
}

/**
 * C2 — Вычислить границы рабочего времени из событий kind:"working" в видимом диапазоне.
 * Возвращает { minMinute, maxMinute } ±1 час (60 мин), зажатое в [0, 1440].
 * null если рабочих событий нет (клиент берёт дефолт).
 */
function deriveWorkingBounds(
  working: CalendarWorkingEvent[],
  timeZone: string,
): WorkingBounds | null {
  if (working.length === 0) return null;

  let minMinute = Infinity;
  let maxMinute = -Infinity;

  for (const ev of working) {
    const start = DateTime.fromISO(ev.startAt, { zone: timeZone });
    const end = DateTime.fromISO(ev.endAt, { zone: timeZone });
    if (!start.isValid || !end.isValid) continue;
    const startM = start.hour * 60 + start.minute;
    const endM = end.hour * 60 + end.minute;
    if (startM < minMinute) minMinute = startM;
    if (endM > maxMinute) maxMinute = endM;
  }

  if (!Number.isFinite(minMinute) || !Number.isFinite(maxMinute)) return null;

  return {
    minMinute: Math.max(0, minMinute - 60),
    maxMinute: Math.min(1440, maxMinute + 60),
  };
}

async function listWorkingAndBreakEvents(
  filters: CalendarFilters,
  schedulingPort: BookingSchedulingPort,
): Promise<{ working: CalendarWorkingEvent[]; breaks: CalendarBreakEvent[] }> {
  const timeZone = filters.timeZone ?? "Europe/Moscow";
  const rows = await schedulingPort.listWorkingHours({
    organizationId: filters.organizationId,
    specialistId: filters.specialistId ?? null,
    branchId: filters.branchId ?? null,
    roomId: filters.roomId ?? null,
  });
  const effectiveRows = pickWorkingHours(mapWorkingRows(rows));
  const dateKeys = enumerateDateKeys(filters.rangeStart, filters.rangeEnd, timeZone);

  const working: CalendarWorkingEvent[] = [];
  const breaks: CalendarBreakEvent[] = [];
  for (const dateKey of dateKeys) {
    const intervals = workingIntervalsForDate(dateKey, timeZone, effectiveRows, 0)
      .filter((i) => i.endMs > i.startMs)
      .sort((a, b) => a.startMs - b.startMs);
    for (let i = 0; i < intervals.length; i += 1) {
      const interval = intervals[i]!;
      working.push({
        kind: "working",
        id: `working:${dateKey}:${i}:${filters.specialistId ?? "any"}:${filters.branchId ?? "any"}`,
        startAt: new Date(interval.startMs).toISOString(),
        endAt: new Date(interval.endMs).toISOString(),
        specialistId: filters.specialistId ?? null,
        branchId: filters.branchId ?? null,
        roomId: filters.roomId ?? null,
      });
      if (i === 0) continue;
      const prev = intervals[i - 1]!;
      if (interval.startMs <= prev.endMs) continue;
      breaks.push({
        kind: "break",
        id: `break:${dateKey}:${i}:${filters.specialistId ?? "any"}:${filters.branchId ?? "any"}`,
        startAt: new Date(prev.endMs).toISOString(),
        endAt: new Date(interval.startMs).toISOString(),
        specialistId: filters.specialistId ?? null,
        branchId: filters.branchId ?? null,
        roomId: filters.roomId ?? null,
      });
    }
  }
  return { working, breaks };
}

export function createBookingCalendarService(deps: Deps): BookingCalendarService {
  return {
    async getCalendar(filters: CalendarFilters): Promise<CalendarAggregate> {
      const showWorkingHours = deps.resolveShowWorkingHours
        ? await deps.resolveShowWorkingHours()
        : true;
      const [appointmentEvents, blocks, filterMeta, workingAndBreak] = await Promise.all([
        deps.calendarPort.listAppointmentsInRange(filters),
        deps.listScheduleBlocks({
          organizationId: filters.organizationId,
          rangeStart: filters.rangeStart,
          rangeEnd: filters.rangeEnd,
        }),
        deps.calendarPort.listFilterMeta(filters.organizationId),
        deps.schedulingPort && showWorkingHours
          ? listWorkingAndBreakEvents(filters, deps.schedulingPort)
          : Promise.resolve({ working: [], breaks: [] }),
      ]);

      const blockEvents = blocks
        .filter(
          (b) =>
            matchesOptionalFilter(b.specialistId, filters.specialistId)
            && matchesOptionalFilter(b.branchId, filters.branchId)
            && matchesOptionalFilter(b.roomId, filters.roomId),
        )
        .map(mapBlock);

      const timeZone = filters.timeZone ?? "Europe/Moscow";
      const workingBounds = showWorkingHours
        ? deriveWorkingBounds(workingAndBreak.working, timeZone)
        : null;

      return {
        events: [
          ...appointmentEvents,
          ...blockEvents,
          ...workingAndBreak.working,
          ...workingAndBreak.breaks,
        ],
        filters: filterMeta,
        readSource: "canonical",
        showWorkingHours,
        workingBounds,
      };
    },
  };
}
