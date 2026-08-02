import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireAdminBookingEngine } from '../../../_requireAdminBookingEngine';

type RouteContext = { params: Promise<{ id: string }> };

// ST-02 admin mirror of the doctor «Пересчитать» endpoint.
// Returns the full summary object (same contract as the doctor route) so admin UI has
// the same payload shape. IDOR/ownership scoped by organizationId from the gate.
export async function POST(_request: Request, context: RouteContext) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id: patientPackageId } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const memberships = deps.memberships;
  try {
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.patient-packages.recalc',
      () =>
        memberships.recalcPastSessionsForPackageDbPhase({
          organizationId: gate.ctx.organizationId,
          patientPackageId,
          createdByPlatformUserId: gate.ctx.session.user.userId,
        }),
    );
    await memberships.refreshRecalcPastSessionsCalendar(result.appointmentsToRefresh);
    const { summary } = result;
    return NextResponse.json({ ok: true, summary });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'recalc_failed';
    return NextResponse.json({ ok: false, error: msg }, { status: 400 });
  }
}
