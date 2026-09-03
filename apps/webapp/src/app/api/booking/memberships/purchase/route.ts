import { NextResponse } from 'next/server';
import { jsonError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '../../bookingTenant';

/**
 * Closed allowlist of the membership codes the patient booking screen is allowed to be told about
 * (`modules/memberships` throws these literals). Anything else — a rejected INSERT, a runtime bug —
 * collapses to `purchase_failed` and goes to the operator log under the correlation id instead.
 */
const PURCHASE_ERROR_RULES: ApiErrorLiteralRules = {
  catalog_not_found: { code: 'catalog_not_found', status: 404 },
  package_not_found: { code: 'package_not_found', status: 404 },
  package_expired: { code: 'package_expired', status: 409 },
  package_no_balance: { code: 'package_no_balance', status: 409 },
  package_not_active: { code: 'package_not_active', status: 409 },
  payments_disabled: { code: 'payments_disabled', status: 422 },
  payments_unavailable: { code: 'payments_unavailable', status: 503 },
  memberships_unavailable: { code: 'memberships_unavailable', status: 503 },
};

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
    return jsonError({
      error,
      literalRules: PURCHASE_ERROR_RULES,
      fallback: { code: 'purchase_failed', status: 400 },
      logEvent: 'patient_membership_purchase_failed',
    });
  }
}
