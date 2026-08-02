import { NextResponse } from 'next/server';
import { parseCalendarQuery } from '@/app-layer/booking/parseCalendarQuery';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveDoctorCalendarIana } from '@/app-layer/booking/resolveDoctorCalendarIana';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import type { CalendarFilterMeta } from '@/modules/booking-calendar/types';
import { requireDoctorBookingEngine } from '../_requireDoctorBookingEngine';
import {
  parseDoctorScheduleScopeQuery,
  resolveDoctorScheduleScope,
  type ResolvedDoctorScheduleScope,
} from '../_resolveDoctorScheduleScope';

function scopeCalendarFilterMeta(
  filters: CalendarFilterMeta,
  resolvedScope: ResolvedDoctorScheduleScope,
): CalendarFilterMeta {
  if (!resolvedScope.specialistId) return filters;
  const specialistId = resolvedScope.specialistId;
  return {
    ...filters,
    specialists: filters.specialists.filter((option) => option.id === specialistId),
    services: filters.services.map((service) => ({
      ...service,
      availability: service.availability.filter(
        (availability) => availability.specialistId === specialistId,
      ),
    })),
  };
}

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingCalendar) {
    return NextResponse.json({ ok: false, error: 'booking_calendar_unavailable' }, { status: 503 });
  }

  // Resolve effective doctor timezone: personal TZ ?? app_display_timezone
  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const timeZone = await resolveDoctorCalendarIana(gate.ctx.session.user.userId).catch(
    () => appDisplayTimeZone,
  );
  const searchParams = new URL(request.url).searchParams;
  const parsed = parseCalendarQuery(searchParams, timeZone);
  if ('error' in parsed) {
    return NextResponse.json({ ok: false, error: parsed.error }, { status: 400 });
  }
  const scopeInput = parseDoctorScheduleScopeQuery(searchParams);
  if (!scopeInput.ok) {
    return NextResponse.json({ ok: false, error: scopeInput.error }, { status: 400 });
  }
  const scheduleScope = await resolveDoctorScheduleScope(gate.ctx, scopeInput.value);
  if (!scheduleScope.ok) {
    const status = scheduleScope.error === 'schedule_specialist_not_available' ? 404 : 409;
    return NextResponse.json({ ok: false, error: scheduleScope.error }, { status });
  }

  try {
    const aggregate = await deps.bookingCalendar.getCalendar({
      organizationId: gate.ctx.organizationId,
      rangeStart: parsed.rangeStart,
      rangeEnd: parsed.rangeEnd,
      timeZone,
      specialistId: scheduleScope.value.specialistId,
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
      filters: scopeCalendarFilterMeta(aggregate.filters, scheduleScope.value),
      resolvedScope: scheduleScope.value,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'calendar_load_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
