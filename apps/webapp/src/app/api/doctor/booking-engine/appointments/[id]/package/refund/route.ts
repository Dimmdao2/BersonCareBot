import { runPackageDetach } from '@/app/api/booking-engine/packageDetachShared';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireDoctorBookingEngine } from '../../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../../_resolveDoctorAppointmentAccess';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirmPastTwice?: boolean };
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'own');
  if (!appointment) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return runPackageDetach({
    organizationId: gate.ctx.organizationId,
    appointmentId,
    createdByPlatformUserId: gate.ctx.session.user.userId,
    outcome: 'refund_consumed',
    confirmPastTwice: body.confirmPastTwice,
    runDetachMutation: (fn) =>
      withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking-engine.package.refund', fn),
  });
}
