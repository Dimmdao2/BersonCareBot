import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const patientPackageId = new URL(request.url).searchParams.get('patientPackageId')?.trim();
  if (!patientPackageId) {
    return NextResponse.json({ ok: false, error: 'patient_package_id_required' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const organizationId =
    await deps.memberships.resolvePatientPackageOrganizationId(patientPackageId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const entitlement = await requireEntitlementForRead({ organizationId }, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const pkg = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/memberships/payment-status:GET' },
    () => deps.memberships!.getPatientPackageDetail(patientPackageId, organizationId),
  );
  if (!pkg || pkg.package.platformUserId !== gate.session.user.userId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const intent = pkg.package.paymentIntentId
    ? await deps.payments?.getIntentForOrganization(pkg.package.paymentIntentId, organizationId)
    : null;
  const paymentsAvailability = await getMechanicMutationAvailability(
    { organizationId },
    'payments',
  );
  return NextResponse.json({
    ok: true,
    patientPackageId,
    status: pkg.package.status,
    intentId: pkg.package.paymentIntentId,
    intentStatus: intent?.status ?? null,
    checkoutUrl: paymentsAvailability.available ? (intent?.checkoutUrl ?? null) : null,
    priceMinor: pkg.package.priceMinor,
    currency: pkg.package.currency,
    package: pkg.package,
  });
}
