import { z } from 'zod';
import { runPackageDetach } from '@/app/api/booking-engine/packageDetachShared';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireDoctorBookingEngine } from '../../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../../_resolveDoctorAppointmentAccess';

const bodySchema = z.object({
  outcome: z.enum(['release_reserve', 'charge_as_delivered', 'refund_consumed']).optional(),
  confirmPastTwice: z.boolean().optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const { id: appointmentId } = await context.params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) {
    return Response.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'own');
  if (!appointment) {
    return Response.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return runPackageDetach({
    organizationId: gate.ctx.organizationId,
    appointmentId,
    createdByPlatformUserId: gate.ctx.session.user.userId,
    outcome: parsed.data.outcome,
    confirmPastTwice: parsed.data.confirmPastTwice,
    runDetachMutation: (fn) =>
      withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking-engine.package.detach', fn),
  });
}
