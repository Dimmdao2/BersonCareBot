import { NextResponse } from 'next/server';
import { jsonError } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { resolveDoctorCalendarIana } from '@/app-layer/booking/resolveDoctorCalendarIana';
import { getAppDisplayTimeZone } from '@/modules/system-settings/appDisplayTimezone';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';
import {
  parseDoctorScheduleScopeQuery,
  resolveDoctorScheduleScope,
} from '../../_resolveDoctorScheduleScope';

const FeedQuerySchema = z.object({
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  q: z.string().trim().min(3).max(160).optional(),
  order: z.enum(['asc', 'desc']).default('asc'),
  includeCancelled: z.enum(['true', 'false']).default('false').transform((value) => value === 'true'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  branchId: z.string().uuid().optional(),
  roomId: z.string().uuid().optional(),
  serviceId: z.string().uuid().optional(),
});

export async function GET(request: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingCalendar) {
    return NextResponse.json({ ok: false, error: 'booking_calendar_unavailable' }, { status: 503 });
  }

  const searchParams = new URL(request.url).searchParams;
  const parsed = FeedQuerySchema.safeParse(Object.fromEntries(searchParams));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_feed_query' }, { status: 400 });
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

  const appDisplayTimeZone = await getAppDisplayTimeZone();
  const timeZone = await resolveDoctorCalendarIana(gate.ctx.session.user.userId).catch(
    () => appDisplayTimeZone,
  );
  try {
    const page = await deps.bookingCalendar.listAppointmentFeed({
      organizationId: gate.ctx.organizationId,
      rangeStart: parsed.data.from,
      rangeEnd: parsed.data.to,
      search: parsed.data.q,
      order: parsed.data.order,
      includeCancelled: parsed.data.includeCancelled,
      limit: parsed.data.limit,
      offset: parsed.data.offset,
      timeZone,
      specialistId: scheduleScope.value.specialistId,
      branchId: parsed.data.branchId,
      roomId: parsed.data.roomId,
      serviceId: parsed.data.serviceId,
    });
    return NextResponse.json({ ok: true, timeZone, ...page });
  } catch (error) {
    return jsonError({
      error,
      fallback: { code: 'appointment_feed_load_failed', status: 500 },
      logEvent: 'doctor_appointment_feed_failed',
    });
  }
}
