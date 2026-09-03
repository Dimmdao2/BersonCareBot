import { stampBootstrapPrincipal } from '@/app-layer/principal/bootstrapPrincipal';
import { NextResponse } from 'next/server';
import { jsonError } from '@/shared/http/apiResponse';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { logger } from '@/app-layer/logging/logger';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import {
  InPersonBookingResolveError,
  resolveSlugBoundPublicInPersonBookingOrganization,
} from '@/modules/patient-booking/inPersonBookingResolve';

const querySchema = z.object({
  orgSlug: z.string().trim().min(1).max(120),
  branchId: z.string().uuid(),
  serviceId: z.string().uuid(),
});

export async function GET(request: Request) {
  stampBootstrapPrincipal('api/booking/public/form-fields:GET', request);
  const deps = buildAppDeps();
  if (!deps.bookingEngine || !deps.bookingForm) {
    return NextResponse.json({ ok: false, error: 'booking_form_unavailable' }, { status: 503 });
  }
  const params = new URL(request.url).searchParams;
  const raw = {
    orgSlug: params.get('orgSlug'),
    branchId: params.get('branchId'),
    serviceId: params.get('serviceId'),
  };
  if (!raw.orgSlug?.trim() || !raw.branchId?.trim() || !raw.serviceId?.trim()) {
    return NextResponse.json({ ok: false, error: 'ambiguous_booking_tenant' }, { status: 400 });
  }
  const parsed = querySchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }
  try {
    const ctx = await resolveSlugBoundPublicInPersonBookingOrganization(deps, parsed.data);
    const fields = await withExplicitOrganizationPrincipal(
      { organizationId: ctx.organizationId, source: 'api/booking/public/form-fields:GET' },
      () => deps.bookingForm!.listPatientFields(ctx.organizationId),
    );
    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'ambiguous_booking_tenant';
    if (error instanceof InPersonBookingResolveError) {
      const status = message === 'branch_service_mapping_missing' ? 404 : 400;
      // Reason stays server-side: distinct wire errors would let anonymous callers enumerate clinics/services.
      logger.warn(
        {
          reason: error.reason,
          branchId: parsed.data.branchId,
          serviceId: parsed.data.serviceId,
          orgSlug: parsed.data.orgSlug,
        },
        '[booking/public/form-fields] in-person booking resolution refused',
      );
      return NextResponse.json({ ok: false, error: message }, { status });
    }
    return jsonError({
      error,
      fallback: { code: 'ambiguous_booking_tenant', status: 400 },
      logEvent: 'public_booking_form_fields_failed',
    });
  }
}
