import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const upsertBody = z.object({
  cancellationPolicyId: z.string().uuid().nullable().optional(),
  reschedulePolicyId: z.string().uuid().nullable().optional(),
  cancellationAllowed: z.boolean(),
  rescheduleAllowed: z.boolean(),
  freeChangeHoursBefore: z.number().int().min(0),
  lateChangeBehavior: z.enum([
    'penalty',
    'manual_review',
    'charge_package',
    'retain_prepayment',
    'refund_prepayment',
  ]),
  refundPrepaymentOnLate: z.string().min(1),
  chargePackageSessionOnLate: z.boolean(),
  requiresStaffConfirmation: z.boolean(),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingPolicies) {
    return NextResponse.json({ ok: false, error: 'booking_policies_unavailable' }, { status: 503 });
  }
  const { organizationId } = gate.ctx;
  const policy = await deps.bookingPolicies.getBookingPolicy(organizationId);
  return NextResponse.json({ ok: true, policy });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const parsed = upsertBody.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.bookingPolicies) {
    return NextResponse.json({ ok: false, error: 'booking_policies_unavailable' }, { status: 503 });
  }
  const bookingPolicies = deps.bookingPolicies;
  const { organizationId } = gate.ctx;
  try {
    const policy = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.policies.upsert',
      () =>
        bookingPolicies.upsertBookingPolicy({
          ...parsed.data,
          organizationId,
          title: 'Политика отмены и переноса',
          notifyPatient: true,
          notifyStaff: true,
        }),
    );
    return NextResponse.json({ ok: true, policy });
  } catch (error) {
    if (error instanceof Error && error.message === 'policy_not_found') {
      return NextResponse.json({ ok: false, error: 'policy_not_found' }, { status: 404 });
    }
    console.error('[booking-policy] mutation failed', {
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'booking_policy_write_unavailable' },
      { status: 503 },
    );
  }
}
