import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicMutationAvailability,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import {
  InPersonBookingResolveError,
  resolveInPersonBookingContext,
} from '@/modules/patient-booking/inPersonBookingResolve';

async function resolveServiceIdForBooking(
  deps: ReturnType<typeof buildAppDeps>,
  input: { branchId?: string; serviceId?: string },
): Promise<{ organizationId: string; serviceId: string } | NextResponse> {
  const branchId = input.branchId?.trim() ?? '';
  const serviceId = input.serviceId?.trim() ?? '';
  if (branchId && serviceId) {
    try {
      const ctx = await resolveInPersonBookingContext(deps, { branchId, serviceId });
      return { organizationId: ctx.organizationId, serviceId };
    } catch (err) {
      if (err instanceof InPersonBookingResolveError) {
        return NextResponse.json({ ok: false, error: err.message }, { status: 404 });
      }
      throw err;
    }
  }

  return NextResponse.json({ ok: false, error: 'service_id_required' }, { status: 400 });
}

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;
  const params = new URL(request.url).searchParams;
  const deps = buildAppDeps();
  if (!deps.memberships || !deps.bookingEngine) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const { memberships } = deps;

  const resolvedOrResponse = await resolveServiceIdForBooking(deps, {
    branchId: params.get('branchId') ?? undefined,
    serviceId: params.get('serviceId') ?? undefined,
  });
  if (resolvedOrResponse instanceof NextResponse) return resolvedOrResponse;
  const entitlement = await requireEntitlementForRead(
    { organizationId: resolvedOrResponse.organizationId },
    'subscriptions',
  );
  if (!entitlement.ok) return entitlement.response;
  const mutationAvailability = await getMechanicMutationAvailability(
    { organizationId: resolvedOrResponse.organizationId },
    'subscriptions',
  );
  // This is not clinical history: it powers selecting a package for a new booking. Read-only
  // clinics keep their package records but must create ordinary bookings without reserving one.
  if (!mutationAvailability.available) {
    return NextResponse.json({ ok: true, packages: [] });
  }

  const packages = await withExplicitOrganizationPrincipal(
    {
      organizationId: resolvedOrResponse.organizationId,
      source: 'api/booking/memberships/available:GET',
    },
    () =>
      memberships.listActivePackagesForBooking(
        gate.session.user.userId,
        resolvedOrResponse.organizationId,
        resolvedOrResponse.serviceId,
      ),
  );
  return NextResponse.json({ ok: true, packages });
}
