import type { CalendarViewMode } from "@/modules/booking-calendar/types";
import { DateTime } from "luxon";

export type ParsedCalendarQuery = {
  rangeStart: string;
  rangeEnd: string;
  view: CalendarViewMode;
  specialistId: string | null;
  branchId: string | null;
  roomId: string | null;
  serviceId: string | null;
  includeFreeSlots: boolean;
  anchorDate: string;
};

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Парсит searchParams запроса к календарному фиду.
 *
 * Если переданы явные `from` и `to` (ISO-дата YYYY-MM-DD или ISO-datetime), они
 * используются напрямую как rangeStart/rangeEnd и view="feed" (либо view из параметра).
 * При отсутствии from/to применяется логика view→диапазон (week/month/day/3days) — backward-compat.
 *
 * Поддерживаемые значения view:
 *  - "week"               → пн–вс якорной недели
 *  - "month"             → 1-е..последнее месяца якорной даты (без overflow-дней FullCalendar)
 *  - "day"               → только якорный день
 *  - "3days"             → якорь + 2 дня вперёд (включительно)
 *  - "feed"              → диапазон задаётся явным from/to
 */
export function parseCalendarQuery(
  searchParams: URLSearchParams,
  timeZone: string,
): ParsedCalendarQuery | { error: string } {
  const viewParam = searchParams.get("view") ?? "week";
  const view: CalendarViewMode =
    viewParam === "day" ||
    viewParam === "month" ||
    viewParam === "3days" ||
    viewParam === "feed"
      ? (viewParam as CalendarViewMode)
      : "week";

  const anchorDate = searchParams.get("date") ?? DateTime.now().setZone(timeZone).toISODate() ?? "";
  if (!ISO_DATE_RE.test(anchorDate)) {
    return { error: "invalid_date" };
  }
  const anchor = DateTime.fromISO(anchorDate, { zone: timeZone });
  if (!anchor.isValid) {
    return { error: "invalid_date" };
  }

  // C1: явные from/to перекрывают расчёт по view
  const fromParam = searchParams.get("from")?.trim();
  const toParam = searchParams.get("to")?.trim();

  let rangeStart: string;
  let rangeEnd: string;

  if (fromParam && toParam) {
    // Принимаем YYYY-MM-DD или ISO datetime
    const fromDt = ISO_DATE_RE.test(fromParam)
      ? DateTime.fromISO(fromParam, { zone: timeZone }).startOf("day").toUTC()
      : DateTime.fromISO(fromParam).toUTC();
    const toDt = ISO_DATE_RE.test(toParam)
      ? DateTime.fromISO(toParam, { zone: timeZone }).endOf("day").toUTC()
      : DateTime.fromISO(toParam).toUTC();
    if (!fromDt.isValid || !toDt.isValid) {
      return { error: "invalid_from_to" };
    }
    rangeStart = fromDt.toISO()!;
    rangeEnd = toDt.toISO()!;
  } else {
    // Backward-compat: view → диапазон
    let startDt: DateTime;
    let endDt: DateTime;
    if (view === "day") {
      startDt = anchor.startOf("day");
      endDt = anchor.endOf("day");
    } else if (view === "month") {
      // Строго по ТЗ §3.2: 1-е..последний день месяца (без overflow-дней FullCalendar)
      startDt = anchor.startOf("month");
      endDt = anchor.endOf("month");
    } else if (view === "3days") {
      startDt = anchor.startOf("day");
      endDt = anchor.plus({ days: 2 }).endOf("day");
    } else if (view === "feed") {
      // feed без явных from/to: ±30 дней от якоря (§13.6 ТЗ)
      startDt = anchor.minus({ days: 30 }).startOf("day");
      endDt = anchor.plus({ days: 30 }).endOf("day");
    } else {
      // week → пн–вс якорной недели
      startDt = anchor.startOf("week");
      endDt = anchor.endOf("week");
    }
    rangeStart = startDt.toUTC().toISO()!;
    rangeEnd = endDt.toUTC().toISO()!;
  }

  const specialistId = searchParams.get("specialistId")?.trim() || null;
  const branchId = searchParams.get("branchId")?.trim() || null;
  const roomId = searchParams.get("roomId")?.trim() || null;
  const serviceId = searchParams.get("serviceId")?.trim() || null;
  const includeFreeSlots = searchParams.get("includeFreeSlots") === "1";

  return {
    rangeStart,
    rangeEnd,
    view,
    specialistId,
    branchId,
    roomId,
    serviceId,
    includeFreeSlots,
    anchorDate,
  };
}
