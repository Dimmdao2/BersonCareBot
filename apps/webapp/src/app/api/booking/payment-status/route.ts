import { NextResponse } from 'next/server';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requirePatientApiBusinessAccess } from '@/app-layer/guards/requireRole';
import { withPatientIdentityPrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { routePaths } from '@/app-layer/routes/paths';
import { requireResolvedSurface } from '@/shared/lib/surface/requestSurface';

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
  const patientOrigin = requireResolvedSurface(request.headers).publicOrigin;
  const result = await withPatientIdentityPrincipal(
    {
      platformUserId: gate.session.user.userId,
      source: 'api/booking/payment-status:GET',
    },
    () => deps.patientBooking.getBookingPaymentStatus(bookingId, patientOrigin),
  );
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: result.error }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    intentId: result.intentId,
    amountMinor: result.amountMinor,
    currency: result.currency,
    intentStatus: result.intentStatus,
    checkoutUrl: result.checkoutUrl,
    paymentDeadlineAt: result.paymentDeadlineAt,
    appointmentStatus: result.appointmentStatus,
  });
}
