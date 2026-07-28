import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { logger } from '@/app-layer/logging/logger';
import {
  listInPersonServicesForBranch,
  resolveActiveBranchForCity,
} from '@/modules/patient-booking/inPersonServicesCatalog';
import { resolvePatientEnrollmentOrganizationId } from '../../bookingTenant';

const querySchema = z.object({
  cityCode: z.string().trim().min(1),
});

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    cityCode: url.searchParams.get('cityCode') ?? undefined,
  });
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const resolvedOrg = await resolvePatientEnrollmentOrganizationId(deps, gate.session.user.userId);
  if (!resolvedOrg.ok) return resolvedOrg.response;
  const organizationId = resolvedOrg.organizationId;
  if (!deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
  }
  try {
    const listed = await withExplicitOrganizationPrincipal(
      { organizationId, source: 'api/booking/catalog/services:GET' },
      async () => {
        const branch = await resolveActiveBranchForCity(deps, organizationId, parsed.data.cityCode);
        return branch ? listInPersonServicesForBranch(deps, organizationId, branch.id) : null;
      },
    );
    if (!listed) {
      return NextResponse.json({ ok: false, error: 'city_not_found' }, { status: 404 });
    }
    const services = listed.services;
    return NextResponse.json({ ok: true, services }, { status: 200 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'city_not_found' || msg === 'city_code_required') {
      return NextResponse.json({ ok: false, error: 'city_not_found' }, { status: 404 });
    }
    logger.error({ err }, '[booking/catalog/services] failed');
    return NextResponse.json({ ok: false, error: 'catalog_unavailable' }, { status: 503 });
  }
}
