import { NextResponse } from 'next/server';
import { jsonError } from '@/shared/http/apiResponse';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { routePaths } from '@/app-layer/routes/paths';
import {
  InPersonBookingResolveError,
  resolveCurrentPatientInPersonBookingContext,
} from '@/modules/patient-booking/inPersonBookingResolve';

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({ returnPath: routePaths.patientBooking });
  if (!gate.ok) return gate.response;

  const deps = buildAppDeps();
  if (!deps.bookingForm) {
    return NextResponse.json({ ok: false, error: 'booking_form_unavailable' }, { status: 503 });
  }
  const params = new URL(request.url).searchParams;
  try {
    const ctx = await resolveCurrentPatientInPersonBookingContext(deps, {
      branchId: params.get('branchId'),
      serviceId: params.get('serviceId'),
    });
    const fields = await deps.bookingForm.listPatientFields(ctx.organizationId);
    return NextResponse.json({ ok: true, fields });
  } catch (error) {
    if (error instanceof InPersonBookingResolveError) {
      const status = error.code === 'branch_service_mapping_missing' ? 404 : 400;
      return NextResponse.json({ ok: false, error: error.code }, { status });
    }
    return jsonError({
      error,
      fallback: { code: 'ambiguous_booking_tenant', status: 400 },
      logEvent: 'booking_form_fields_failed',
    });
  }
}
