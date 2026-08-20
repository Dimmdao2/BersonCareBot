import { NextResponse } from 'next/server';
import { z } from 'zod';
import { loadStaffAppointmentPaymentSummary } from '@/app-layer/booking/staffAppointmentPaymentSummary';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { env } from '@/config/env';
import { routePaths } from '@/app-layer/routes/paths';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../_resolveDoctorAppointmentAccess';

type RouteContext = { params: Promise<{ id: string }> };

const postSchema = z.object({ action: z.enum(['cash', 'link']) });

async function resolveAppointmentPaymentContext(appointmentId: string) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate;
  const appointment = await resolveDoctorAppointmentAccess(gate.ctx, appointmentId, 'clinic');
  if (!appointment) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }) };
  if (!appointment.platformUserId) return { ok: false as const, response: NextResponse.json({ ok: false, error: 'patient_required' }, { status: 409 }) };
  return { ok: true as const, gate, appointment };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: appointmentId } = await context.params;
  const resolved = await resolveAppointmentPaymentContext(appointmentId);
  if (!resolved.ok) return resolved.response;
  const { gate, appointment } = resolved;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  }
  const summary = await loadStaffAppointmentPaymentSummary(
    deps,
    appointmentId,
    gate.ctx.organizationId,
  );
  if (!summary) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const booking = await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId);
  const manual = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.booking.appointment-payment.read',
    () => deps.patientPayments.listAppointmentPayments(appointmentId, appointment.platformUserId!),
  );
  return NextResponse.json({
    ok: true,
    summary,
    totalMinor: booking?.priceMinorSnapshot ?? null,
    manualPaidMinor: manual
      .filter((payment) => payment.status === 'paid')
      .reduce((sum, payment) => sum + payment.amountMinor, 0),
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: appointmentId } = await context.params;
  const resolved = await resolveAppointmentPaymentContext(appointmentId);
  if (!resolved.ok) return resolved.response;
  let body: unknown;
  try { body = await request.json(); } catch { return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 }); }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const { gate, appointment } = resolved;
  const deps = buildAppDeps();
  if (!deps.payments) return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  const summary = await loadStaffAppointmentPaymentSummary(deps, appointmentId, gate.ctx.organizationId);
  const booking = await deps.patientBooking.getBookingByCanonicalAppointment(appointmentId);
  const totalMinor = booking?.priceMinorSnapshot ?? null;
  if (!summary || !booking || !totalMinor || totalMinor <= 0) return NextResponse.json({ ok: false, error: 'appointment_amount_unavailable' }, { status: 409 });
  const manual = await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking.appointment-payment.read', () => deps.patientPayments.listAppointmentPayments(appointmentId, appointment.platformUserId!));
  const capturedMinor = summary.payment?.status === 'succeeded' ? summary.payment.amountMinor : 0;
  const manualMinor = manual.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amountMinor, 0);
  const remainingMinor = Math.max(0, totalMinor - capturedMinor - manualMinor);
  if (remainingMinor === 0) return NextResponse.json({ ok: false, error: 'already_paid' }, { status: 409 });
  if (parsed.data.action === 'cash') {
    const existingCash = manual.find((payment) => payment.kind === 'cash' && payment.status === 'paid' && payment.amountMinor === remainingMinor);
    const payment = existingCash ?? await withDoctorWorkspacePrincipal(gate.ctx, 'doctor.booking.appointment-payment.cash', () => deps.patientPayments.addCashPayment({ organizationId: gate.ctx.organizationId, patientUserId: appointment.platformUserId!, appointmentId, amountMinor: remainingMinor, currency: 'RUB', service: booking.serviceTitleSnapshot ?? null, comment: 'Оплачено наличными в карточке записи', createdBy: gate.ctx.session.user.userId }));
    return NextResponse.json({ ok: true, payment, remainingMinor: existingCash ? remainingMinor : 0 });
  }
  try {
    const intent = await deps.payments.createAppointmentPaymentIntent({ organizationId: gate.ctx.organizationId, appointmentId, platformUserId: appointment.platformUserId, amountMinor: remainingMinor, currency: 'RUB', idempotencyKey: `staff-appointment-link:${appointmentId}:${remainingMinor}`, returnUrl: `${env.APP_BASE_URL}${routePaths.purchases}` });
    if (!intent.checkoutUrl) return NextResponse.json({ ok: false, error: 'payment_link_unavailable' }, { status: 503 });
    return NextResponse.json({ ok: true, paymentLink: intent.checkoutUrl, remainingMinor });
  } catch (error) {
    const code = error instanceof Error ? error.message : 'payment_provider_unavailable';
    return NextResponse.json({ ok: false, error: code }, { status: 503 });
  }
}
