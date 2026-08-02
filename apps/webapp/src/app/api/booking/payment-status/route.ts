import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withExplicitOrganizationPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';

export async function GET(request: Request) {
  const gate = await requirePatientApiBusinessAccess({
    returnPath: routePaths.patientBooking,
  });
  if (!gate.ok) return gate.response;

  const bookingId = new URL(request.url).searchParams.get('bookingId')?.trim();
  if (!bookingId) {
    return NextResponse.json({ ok: false, error: 'invalid_query' }, { status: 400 });
  }

  const deps = buildAppDeps();
  const organizationId = await deps.patientBooking.resolveBookingOrganizationId(bookingId);
  if (!organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const result = await withExplicitOrganizationPrincipal(
    { organizationId, source: 'api/booking/payment-status:GET' },
    () => deps.patientBooking.getBookingPaymentStatus(bookingId, gate.session.user.userId),
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    booking: result.booking,
    summary: result.summary,
    intentId: result.intentId,
  });
}
