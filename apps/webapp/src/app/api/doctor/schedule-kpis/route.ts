/**
 * GET /api/doctor/schedule-kpis?from=<ISO>&to=<ISO>[&branchId=<id>][&serviceId=<id>]
 *
 * Возвращает 9 KPI-метрик для таба «Записи» по произвольному диапазону.
 * Требует авторизации доктора/администратора.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDoctorWorkspaceApiContext } from '@/app-layer/guards/requireRole';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { loadDoctorAnalyticsAudience } from '@/app-layer/analytics/loadAnalyticsAudience';
import { logger, serializeError } from '@/infra/logging/logger';

const KpisQuerySchema = z.object({
  from: z.string().min(1, 'from is required'),
  to: z.string().min(1, 'to is required'),
  branchId: z.string().optional().nullable(),
  serviceId: z.string().optional().nullable(),
});

export async function GET(req: Request) {
  const gate = await requireDoctorWorkspaceApiContext();
  if (!gate.ok) return gate.response;

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

  const deps = buildAppDeps();
  const audience = await loadDoctorAnalyticsAudience();

  try {
    const kpis = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.schedule-kpis.read', () =>
      deps.doctorAppointments.getScheduleKpis(parsed.data, {
        excludedUserIds: audience?.excludedUserIds ?? [],
        organizationId: gate.ctx.organizationId,
      }),
    );
    return NextResponse.json({ ok: true, kpis });
  } catch (e) {
    logger.error(
      { err: serializeError(e), from: parsed.data.from, to: parsed.data.to },
      'schedule-kpis.failed',
    );
    return NextResponse.json({ ok: false, error: 'internal' }, { status: 500 });
  }
}
