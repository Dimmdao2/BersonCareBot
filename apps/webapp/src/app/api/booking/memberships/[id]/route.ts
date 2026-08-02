import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const { id } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const organizationId = await deps.memberships.resolvePatientPackageOrganizationId(id);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const entitlement = await requireEntitlementForRead({ organizationId }, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const detail = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/memberships/[id]:GET' },
    () => deps.memberships!.getPatientPackageDetail(id, organizationId),
  );
  if (!detail || detail.package.platformUserId !== gate.session.user.userId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, ...detail });
}
