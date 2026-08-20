import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createStaffAppointmentPaymentsService } from '@/app-layer/booking/staffAppointmentPayments';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
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
  if (!appointment)
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 }),
    };
  const platformUserId = appointment.platformUserId;
  if (!platformUserId)
    return {
      ok: false as const,
      response: NextResponse.json({ ok: false, error: 'patient_required' }, { status: 409 }),
    };
  return { ok: true as const, gate, appointment, platformUserId };
}

export async function GET(_request: Request, context: RouteContext) {
  const { id: appointmentId } = await context.params;
  const resolved = await resolveAppointmentPaymentContext(appointmentId);
  if (!resolved.ok) return resolved.response;
  const { gate, platformUserId } = resolved;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  }
  const service = createStaffAppointmentPaymentsService(deps);
  const state = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.booking.appointment-payment.read',
    () =>
      service.getPaymentState({
        appointmentId,
        organizationId: gate.ctx.organizationId,
        platformUserId,
      }),
  );
  if (!state.summary) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({
    ok: true,
    summary: state.summary,
    totalMinor: state.totalMinor,
    manualPaidMinor: state.manualPaidMinor,
  });
}

export async function POST(request: Request, context: RouteContext) {
  const { id: appointmentId } = await context.params;
  const resolved = await resolveAppointmentPaymentContext(appointmentId);
  if (!resolved.ok) return resolved.response;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 });
  }
  const parsed = postSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  const { gate, platformUserId } = resolved;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'payments');
  if (!entitlement.ok) return entitlement.response;
  const deps = buildAppDeps();
  if (!deps.payments)
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  const service = createStaffAppointmentPaymentsService(deps);
  try {
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      parsed.data.action === 'cash'
        ? 'doctor.booking.appointment-payment.cash'
        : 'doctor.booking.appointment-payment.link',
      () =>
        service.createPayment({
          action: parsed.data.action,
          appointmentId,
          organizationId: gate.ctx.organizationId,
          platformUserId,
          createdBy: gate.ctx.session.user.userId,
          returnUrl: `${env.APP_BASE_URL}${routePaths.purchases}`,
        }),
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    const code = error instanceof Error ? error.message : 'payment_provider_unavailable';
    return NextResponse.json({ ok: false, error: code }, { status: 503 });
  }
}
