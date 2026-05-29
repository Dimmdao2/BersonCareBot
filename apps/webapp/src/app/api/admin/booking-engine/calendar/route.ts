import { NextResponse } from "next/server";
import { parseCalendarQuery } from "@/app-layer/booking/parseCalendarQuery";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireAdminBookingEngine } from "../_requireAdminBookingEngine";

export async function GET(request: Request) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingCalendar) {
    return NextResponse.json({ ok: false, error: "booking_calendar_unavailable" }, { status: 503 });
  }
  const tzRow = await deps.systemSettings.getSetting("app_display_timezone", "admin");
  const timeZone =
    tzRow?.valueJson && typeof tzRow.valueJson === "object" && typeof (tzRow.valueJson as { value?: unknown }).value === "string"
      ? ((tzRow.valueJson as { value: string }).value)
      : "Europe/Moscow";
  const parsed = parseCalendarQuery(new URL(request.url).searchParams, timeZone);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const aggregate = await deps.bookingCalendar.getCalendar({
    organizationId: gate.ctx.organizationId,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
    specialistId: parsed.specialistId,
    branchId: parsed.branchId,
    roomId: parsed.roomId,
    serviceId: parsed.serviceId,
    includeFreeSlots: parsed.includeFreeSlots,
  });
  return NextResponse.json({
    ok: true,
    view: parsed.view,
    anchorDate: parsed.anchorDate,
    rangeStart: parsed.rangeStart,
    rangeEnd: parsed.rangeEnd,
    timeZone,
    ...aggregate,
  });
}
