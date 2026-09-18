import { NextResponse } from 'next/server';
import { jsonError, type ApiErrorLiteralRules } from '@/shared/http/apiResponse';

/** Closed allowlist of the payment refusals the doctor screen may be told about. */
const PAYMENT_ERROR_RULES: ApiErrorLiteralRules = {
  payments_disabled: { code: 'payments_disabled', status: 422 },
  payments_unavailable: { code: 'payments_unavailable', status: 503 },
  payment_provider_unavailable: { code: 'payment_provider_unavailable', status: 503 },
  appointment_not_found: { code: 'appointment_not_found', status: 404 },
  package_not_found: { code: 'package_not_found', status: 404 },
  invalid_refund_amount: { code: 'invalid_refund_amount', status: 422 },
  refund_amount_exceeds_payment: { code: 'refund_amount_exceeds_payment', status: 409 },
  payment_not_refundable: { code: 'payment_not_refundable', status: 409 },
  appointment_cash_refund_failed: { code: 'appointment_cash_refund_failed', status: 409 },
};
import { z } from 'zod';
import {
  createStaffAppointmentPaymentsService,
  listStaffAppointmentPaymentViews,
} from '@/app-layer/booking/staffAppointmentPayments';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { routePaths } from '@/app-layer/routes/paths';
import { requireDoctorBookingEngine } from '../../../_requireDoctorBookingEngine';
import { resolveDoctorAppointmentAccess } from '../../../_resolveDoctorAppointmentAccess';

type RouteContext = { params: Promise<{ id: string }> };

const postSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.enum(['cash', 'link']),
    amountMinor: z.number().int().positive().optional(),
    purpose: z.enum(['prepayment', 'full', 'partial']).optional(),
  }),
  z.object({
    action: z.literal('refund'),
    amountMinor: z.number().int().positive(),
    method: z.enum(['auto', 'cash']),
    reason: z.string().trim().max(500).optional(),
    requestId: z.string().uuid().optional(),
  }),
]);

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
  const { gate, appointment, platformUserId } = resolved;
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  }
  // APPT-DETAIL-11: обновление после платёжной мутации отвечает тем же контрактом, которым
  // сводка приезжает в первичном payload деталей, — иначе блок оплаты после оплаты наличными
  // рисовался бы по второму, расходящемуся правилу.
  const views = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.booking.appointment-payment.read',
    () =>
      listStaffAppointmentPaymentViews(deps, {
        organizationId: gate.ctx.organizationId,
        targets: [{ appointmentId, platformUserId, serviceId: appointment.serviceId ?? null }],
      }),
  );
  const view = views.get(appointmentId);
  if (!view) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const state = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.booking.appointment-payment.read',
    () =>
      createStaffAppointmentPaymentsService(deps).getPaymentState({
        appointmentId,
        organizationId: gate.ctx.organizationId,
        platformUserId,
      }),
  );
  return NextResponse.json({
    ok: true,
    payment: view,
    details: {
      onlineHistory: state.summary?.history ?? [],
      manualPayments: state.manualPayments,
    },
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
  const data = parsed.data;
  const { gate, platformUserId } = resolved;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'payments');
  if (!entitlement.ok) return entitlement.response;
  const deps = buildAppDeps();
  if (!deps.payments)
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  const service = createStaffAppointmentPaymentsService(deps);
  try {
    if (data.action === 'refund') {
      const refund = data;
      const result = await withDoctorWorkspacePrincipal(
        gate.ctx,
        'doctor.booking.appointment-payment.refund',
        () =>
          service.refundPayment({
            appointmentId,
            organizationId: gate.ctx.organizationId,
            platformUserId,
            amountMinor: refund.amountMinor,
            method: refund.method,
            reason: refund.reason,
            idempotencyKey: refund.requestId,
            createdBy: gate.ctx.session.user.userId,
          }),
      );
      if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
      return NextResponse.json(result);
    }
    const result = await withDoctorWorkspacePrincipal(
      gate.ctx,
      data.action === 'cash'
        ? 'doctor.booking.appointment-payment.cash'
        : 'doctor.booking.appointment-payment.link',
      () =>
        service.createPayment({
          action: data.action,
          appointmentId,
          organizationId: gate.ctx.organizationId,
          platformUserId,
          createdBy: gate.ctx.session.user.userId,
          returnUrl: routePaths.purchases,
          amountMinor: data.amountMinor,
          purpose: data.purpose,
        }),
    );
    if (!result.ok) return NextResponse.json({ ok: false, error: result.error }, { status: 409 });
    return NextResponse.json(result);
  } catch (error) {
    return jsonError({
      error,
      literalRules: PAYMENT_ERROR_RULES,
      fallback: { code: 'payment_provider_unavailable', status: 503 },
      logEvent: 'doctor_appointment_payment_failed',
    });
  }
}
