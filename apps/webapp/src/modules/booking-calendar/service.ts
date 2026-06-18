import type { BookingSchedulingPort, ScheduleBlockRecord } from "@/modules/booking-scheduling/ports";
import {
  localDateKey,
  pickWorkingHours,
  workingIntervalsForDate,
  type WorkingDayRow,
  type WorkingHoursRow,
} from "@/modules/booking-scheduling/computeSlots";
import type { WorkingDayRecord } from "@/modules/booking-scheduling/ports";
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

/**
 * Map a per-date WorkingDayRecord (be_working_days) to the WorkingDayRow shape
 * consumed by `workingIntervalsForDate`. Applies the same branch-scoping as the
 * slot engine (`computeSlotsInternal`): the per-date override is scoped to the
 * location assigned that day (model: one branch per day). When the queried branch
 * differs from the assigned branch, the specialist is committed elsewhere → the
 * day reads as closed for this branch (mirrors weekday be_working_hours scoping).
 */
function toEffectivePerDayRow(
  record: WorkingDayRecord,
  queriedBranchId: string | null | undefined,
): WorkingDayRow {
  const committedElsewhere =
    record.branchId != null &&
    queriedBranchId != null &&
    record.branchId !== queriedBranchId;
  return {
    workDate: record.workDate,
    startMinute: record.startMinute,
    endMinute: record.endMinute,
    breaks: record.breaks,
    isClosed: committedElsewhere ? true : record.isClosed,
  };
}

async function listWorkingAndBreakEvents(
  filters: CalendarFilters,
  schedulingPort: BookingSchedulingPort,
): Promise<{ working: CalendarWorkingEvent[]; breaks: CalendarBreakEvent[] }> {
  const timeZone = filters.timeZone ?? "Europe/Moscow";
  const dateKeys = enumerateDateKeys(filters.rangeStart, filters.rangeEnd, timeZone);

  const [rows, perDayRows] = await Promise.all([
    schedulingPort.listWorkingHours({
      organizationId: filters.organizationId,
      // CR5-FIX (СИМПТОМ-2): mirrors R18 fix for listWorkingDays.
      // undefined = no filter → returns all per-specialist + global rows.
      // null (explicit specialistId=null in filters) would mean "global-only".
      // Since filters.specialistId is string | null | undefined, using ?? undefined:
      // when caller omits specialistId (undefined) or resolvedSpecialistId is null
      // (multi-specialist org), we pass undefined → all working-hours rows are
      // returned, not just IS-NULL globals. Fixes empty workingBounds → gray fill.
      specialistId: filters.specialistId ?? undefined,
      branchId: filters.branchId ?? undefined,
      roomId: filters.roomId ?? undefined,
    }),
    // §3.13: per-date be_working_days override the weekday schedule for that date.
    // Absent date → undefined → weekday fallback (backward-compatible).
    // NB: do NOT pass branchId here — a day committed to a *different* branch must
    // still be returned so we can mark it closed (committed elsewhere). Branch
    // scoping is applied in `toEffectivePerDayRow`, mirroring `computeSlotsInternal`.
    // R18 FIX: график «График работы» сохраняется ПО СПЕЦИАЛИСТУ (be_working_days
    // specialist_id = <uuid>), а календарь ребилда показывает всё без лока
    // (filters.specialistId обычно undefined). Раньше `?? null` → listWorkingDays
    // фильтровал `IS NULL` (только глобальные) → сохранённый по-врачебно график
    // НИКОГДА не доходил до сетки. `?? undefined` = без фильтра по специалисту
    // (все), чтобы per-date график отображался.
    dateKeys.length > 0
      ? schedulingPort.listWorkingDays({
          organizationId: filters.organizationId,
          specialistId: filters.specialistId ?? undefined,
          dateFrom: dateKeys[0]!,
          dateTo: dateKeys[dateKeys.length - 1]!,
        })
      : Promise.resolve([] as WorkingDayRecord[]),
  ]);
  const effectiveRows = pickWorkingHours(mapWorkingRows(rows));
  const perDayMap = new Map(perDayRows.map((r) => [r.workDate, r]));

  const working: CalendarWorkingEvent[] = [];
  const breaks: CalendarBreakEvent[] = [];
  for (const dateKey of dateKeys) {
    const perDayRecord = perDayMap.get(dateKey);
    const perDayRow = perDayRecord
      ? toEffectivePerDayRow(perDayRecord, filters.branchId)
      : undefined;
    const intervals = workingIntervalsForDate(dateKey, timeZone, effectiveRows, 0, perDayRow)
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
