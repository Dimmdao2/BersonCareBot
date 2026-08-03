import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '../../bookingTenant';

const bodySchema = z.object({
  subscriptionPackageId: z.string().uuid(),
});

export async function POST(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(
    deps,
    gate.session.user.userId,
  );
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  const entitlement = await requireEntitlementForMutation({ organizationId }, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const catalogPackage = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/memberships/purchase:catalog-read' },
    () => deps.memberships!.getCatalogPackage(parsed.data.subscriptionPackageId, organizationId),
  );
  if (!catalogPackage) {
    return NextResponse.json({ ok: false, error: 'catalog_package_not_found' }, { status: 404 });
  }
  if (catalogPackage.priceMinor > 0) {
    const paymentsEntitlement = await requireEntitlementForMutation({ organizationId }, 'payments');
    if (!paymentsEntitlement.ok) return paymentsEntitlement.response;
  }
  try {
    const pkg = await withExplicitOrganizationPrincipal(
      { organizationId, source: 'api/booking/memberships/purchase:POST' },
      () =>
        deps.memberships!.purchaseCatalogPackageForPatient({
          organizationId,
          platformUserId: gate.session.user.userId,
          subscriptionPackageId: parsed.data.subscriptionPackageId,
        }),
    );
    return NextResponse.json({ ok: true, package: pkg });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'purchase_failed';
    return NextResponse.json({ ok: false, error: message }, { status: 400 });
  }
}
