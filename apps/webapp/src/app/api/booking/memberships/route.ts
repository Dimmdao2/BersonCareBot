import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withPatientOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '../bookingTenant';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  const packages = await withPatientOrganizationPrincipal(
    {
      organizationId,
      platformUserId: gate.session.user.userId,
      source: 'api/booking/memberships:GET',
    },
    () => deps.memberships!.listPatientPackagesForUser(gate.session.user.userId, organizationId),
  );
  return NextResponse.json({ ok: true, packages });
}
