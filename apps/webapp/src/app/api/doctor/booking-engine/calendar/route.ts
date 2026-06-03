import { NextResponse } from "next/server";
import { parseCalendarQuery } from "@/app-layer/booking/parseCalendarQuery";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingCalendar) {
    return NextResponse.json({ ok: false, error: "booking_calendar_unavailable" }, { status: 503 });
  }
  let timeZone = "Europe/Moscow";
  try {
    const tzRow = await deps.systemSettings.getSetting("app_display_timezone", "admin");
    if (
      tzRow?.valueJson &&
      typeof tzRow.valueJson === "object" &&
      typeof (tzRow.valueJson as { value?: unknown }).value === "string"
    ) {
      timeZone = (tzRow.valueJson as { value: string }).value;
    }
  } catch {
    timeZone = "Europe/Moscow";
  }
  const parsed = parseCalendarQuery(new URL(request.url).searchParams, timeZone);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  try {
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
  } catch (err) {
    const message = err instanceof Error ? err.message : "calendar_load_failed";
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
