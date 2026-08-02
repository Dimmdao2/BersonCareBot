import { runPackageDetach } from '@/app/api/booking-engine/packageDetachShared';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireAdminBookingEngine } from '../../../../_requireAdminBookingEngine';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id: appointmentId } = await context.params;
  const body = (await request.json().catch(() => ({}))) as { confirmPastTwice?: boolean };
  return runPackageDetach({
    organizationId: gate.ctx.organizationId,
    appointmentId,
    createdByPlatformUserId: gate.ctx.session.user.userId,
    outcome: 'refund_consumed',
    confirmPastTwice: body.confirmPastTwice,
    runDetachMutation: (fn) =>
      withDoctorWorkspacePrincipal(gate.ctx, 'admin.booking-engine.package.refund', fn),
  });
}
