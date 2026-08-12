import { NextResponse } from 'next/server';
import { staffPurgeCancelledAppointment } from '@/app-layer/booking/staffPurgeCancelledAppointment';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireAdminBookingEngine } from '../../../_requireAdminBookingEngine';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.appointmentAccess) {
    return NextResponse.json({ ok: false, error: 'lifecycle_unavailable' }, { status: 503 });
  }
  const result = await staffPurgeCancelledAppointment({
    deps,
    organizationId: gate.ctx.organizationId,
    appointmentId,
    actorId: gate.ctx.session.user.userId,
    runLocalPurge: (fn) =>
      withDoctorWorkspacePrincipal(
        gate.ctx,
        'admin.booking-engine.appointments.cancelled-purge',
        fn,
      ),
  });
  if (!result.ok) {
    const status = result.error === 'not_cancelled' ? 409 : 404;
    return NextResponse.json({ ok: false, error: result.error }, { status });
  }
  return NextResponse.json({
    ok: true,
  });
}
