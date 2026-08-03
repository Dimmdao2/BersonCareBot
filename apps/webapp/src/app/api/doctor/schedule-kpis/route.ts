/**
 * GET /api/doctor/schedule-kpis?from=<ISO>&to=<ISO>[&branchId=<id>][&serviceId=<id>]
 *
 * Возвращает 9 KPI-метрик для таба «Записи» по произвольному диапазону.
 * Требует авторизации доктора/администратора.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { logger, serializeError } from '@/infra/logging/logger';
import { requireDoctorBookingEngine } from '../booking-engine/_requireDoctorBookingEngine';
import {
  parseDoctorScheduleScopeQuery,
  resolveDoctorScheduleScope,
} from '../booking-engine/_resolveDoctorScheduleScope';

const KpisQuerySchema = z.object({
  from: z.string().min(1, 'from is required'),
  to: z.string().min(1, 'to is required'),
  branchId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;

  const entitlement = await requireEntitlementForRead(
    { organizationId: gate.ctx.organizationId },
    'doctor_statistics',
  );
  if (!entitlement.ok) return entitlement.response;

  const url = new URL(req.url);
  const raw = {
    from: url.searchParams.get('from') ?? undefined,
    to: url.searchParams.get('to') ?? undefined,
    branchId: url.searchParams.get('branchId') ?? undefined,
    serviceId: url.searchParams.get('serviceId') ?? undefined,
  };

  const parsed = KpisQuerySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: 'invalid_params', issues: parsed.error.issues },
      { status: 400 },
    );
  }
  const scopeInput = parseDoctorScheduleScopeQuery(url.searchParams);
  if (!scopeInput.ok) {
    return NextResponse.json({ ok: false, error: scopeInput.error }, { status: 400 });
  }
  const scheduleScope = await resolveDoctorScheduleScope(gate.ctx, scopeInput.value);
  if (!scheduleScope.ok) {
    const status = scheduleScope.error === 'schedule_specialist_not_available' ? 404 : 409;
    return NextResponse.json({ ok: false, error: scheduleScope.error }, { status });
  }

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();

  try {
    const kpis = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.schedule-kpis.read', () =>
      deps.doctorAppointments.getScheduleKpis(
        { ...parsed.data, specialistId: scheduleScope.value.specialistId },
        {
          excludedUserIds: audience?.excludedUserIds ?? [],
          organizationId: gate.ctx.organizationId,
        },
      ),
    );
    return NextResponse.json({ ok: true, kpis, resolvedScope: scheduleScope.value });
  } catch (e) {
    logger.error(
      { err: serializeError(e), from: parsed.data.from, to: parsed.data.to },
      'schedule-kpis.failed',
    );
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
