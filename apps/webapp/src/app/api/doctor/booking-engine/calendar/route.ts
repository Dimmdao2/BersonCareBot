import { NextResponse } from "next/server";
import { parseCalendarQuery } from "@/app-layer/booking/parseCalendarQuery";
import { buildAppDeps } from "@/app-layer/di/buildAppDeps";
import { getDoctorEffectiveCalendarIana } from "@/modules/doctor-calendar-timezone/doctorCalendarTimezone";
import { pgDoctorCalendarTimezonePort } from "@/infra/repos/pgDoctorCalendarTimezone";
import { requireDoctorBookingEngine } from "../_requireDoctorBookingEngine";

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingCalendar) {
    return NextResponse.json({ ok: false, error: "booking_calendar_unavailable" }, { status: 503 });
  }

  // Resolve effective doctor timezone: personal TZ ?? app_display_timezone
  const timeZone = await getDoctorEffectiveCalendarIana(
    gate.ctx.session.user.userId,
    pgDoctorCalendarTimezonePort,
  ).catch(() => "Europe/Moscow");
  const parsed = parseCalendarQuery(new URL(request.url).searchParams, timeZone);
  if ("error" in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }

  // When the caller omits specialistId (e.g. ScheduleCalendarTab fetches without it),
  // fall back to the single specialist for this org so that per-specialist working-hours
  // rows (saved by the schedule editor) are included in the calendar feed.
  // Multiple specialists → keep null (all specialists visible, global-only working rows).
  let resolvedSpecialistId = parsed.specialistId;
  if (resolvedSpecialistId === null && deps.bookingEngine) {
    try {
      const specialists = await deps.bookingEngine.catalog.listSpecialists(gate.ctx.organizationId);
      const active = specialists.filter((s) => s.isActive);
      if (active.length === 1) {
        resolvedSpecialistId = active[0]!.id;
      }
    } catch {
      // Non-critical: if lookup fails, keep null (global rows)
    }
  }

  try {
    const aggregate = await deps.bookingCalendar.getCalendar({
      organizationId: gate.ctx.organizationId,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      timeZone,
      specialistId: resolvedSpecialistId,
      branchId: parsed.branchId,
      roomId: parsed.roomId,
      serviceId: parsed.serviceId,
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
