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

export function parseCalendarQuery(
  searchParams: URLSearchParams,
  timeZone: string,
): ParsedCalendarQuery | { error: string } {
  const viewParam = searchParams.get("view") ?? "week";
  const view: CalendarViewMode =
    viewParam === "day" || viewParam === "month" ? viewParam : "week";
  const anchorDate = searchParams.get("date") ?? DateTime.now().setZone(timeZone).toISODate() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(anchorDate)) {
    return { error: "invalid_date" };
  }
  const anchor = DateTime.fromISO(anchorDate, { zone: timeZone });
  if (!anchor.isValid) {
    return { error: "invalid_date" };
  }

  let rangeStart: DateTime;
  let rangeEnd: DateTime;
  if (view === "day") {
    rangeStart = anchor.startOf("day");
    rangeEnd = anchor.endOf("day");
  } else if (view === "month") {
    rangeStart = anchor.startOf("month").startOf("week");
    rangeEnd = anchor.endOf("month").endOf("week");
  } else {
    rangeStart = anchor.startOf("week");
    rangeEnd = anchor.endOf("week");
  }

  const specialistId = searchParams.get("specialistId")?.trim() || null;
  const branchId = searchParams.get("branchId")?.trim() || null;
  const roomId = searchParams.get("roomId")?.trim() || null;
  const serviceId = searchParams.get("serviceId")?.trim() || null;
  const includeFreeSlots = searchParams.get("includeFreeSlots") === "1";

  return {
    rangeStart: rangeStart.toUTC().toISO()!,
    rangeEnd: rangeEnd.toUTC().toISO()!,
    view,
    specialistId,
    branchId,
    roomId,
    serviceId,
    includeFreeSlots,
    anchorDate,
  };
}
