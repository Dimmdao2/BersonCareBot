import { NextResponse } from 'next/server';
import { z } from 'zod';
import { createStaffAppointmentPaymentsService } from '@/app-layer/booking/staffAppointmentPayments';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/guards/doctorWorkspacePrincipal';
import {
  getMechanicMutationAvailability,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
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

/**
 * The card is allowed to render a payment block only for a clinic whose tariff actually carries the
 * `payments` mechanic — the same decision the POST door enforces before touching money. Online
 * options are additionally bound to a configured provider, and the send option to the one delivery
 * path a specialist really has for this patient (the in-app conversation plus its notification
 * fan-out), which only exists once the patient is `linked` to the portal.
 */
async function resolvePaymentCapabilities(
  ctx: { organizationId: string },
  deps: ReturnType<typeof buildAppDeps>,
  payments: NonNullable<ReturnType<typeof buildAppDeps>['payments']>,
  platformUserId: string,
) {
  const entitlement = await getMechanicMutationAvailability(ctx, 'payments');
  if (!entitlement.available) {
    return { entitled: false, onlineAvailable: false, patientChatAvailable: false };
  }
  const [online, portal] = await Promise.all([
    payments.getPrepaymentAvailability(ctx.organizationId),
    withDoctorWorkspacePrincipal(ctx, 'doctor.booking.appointment-payment.read', () =>
      deps.patientInvites.getPortalStatus(ctx.organizationId, platformUserId),
    ).catch(() => null),
  ]);
  return {
    entitled: true,
    onlineAvailable: online.available,
    patientChatAvailable: portal?.status === 'linked',
  };
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
  const capabilities = await resolvePaymentCapabilities(
    gate.ctx,
    deps,
    deps.payments,
    platformUserId,
  );
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
    paymentsEntitled: capabilities.entitled,
    onlinePaymentAvailable: capabilities.onlineAvailable,
    patientChatAvailable: capabilities.patientChatAvailable,
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
