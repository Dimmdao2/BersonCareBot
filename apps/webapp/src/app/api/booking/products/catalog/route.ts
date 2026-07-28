import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { resolvePatientEnrollmentOrganizationId } from '../../bookingTenant';

export async function GET() {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.purchases });
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.products) {
    return NextResponse.json({ ok: false, error: 'products_unavailable' }, { status: 503 });
  }
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  const products = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/products/catalog:GET' },
    () => deps.products!.listCatalog(organizationId),
  );
  const visible = products.filter((p) => p.showInPatientCatalog);
  return NextResponse.json({ ok: true, products: visible });
}
