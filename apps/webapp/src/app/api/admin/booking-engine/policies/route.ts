import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const scopeLevel = z.literal('organization');

const cancelUpsert = z.object({
  kind: z.literal('cancellation'),
  id: z.string().uuid().optional(),
  scopeLevel,
  scopeEntityId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  isActive: z.boolean(),
  freeCancelHoursBefore: z.number().int().min(0),
  cancellationAllowed: z.boolean(),
  lateCancellationBehavior: z.enum([
    'penalty',
    'manual_review',
    'charge_package',
    'retain_prepayment',
    'refund_prepayment',
  ]),
  refundPrepaymentOnLate: z.string().min(1),
  chargePackageSessionOnLate: z.boolean(),
  requiresStaffConfirmation: z.boolean(),
  sortOrder: z.number().int(),
});

const rescheduleUpsert = z.object({
  kind: z.literal('reschedule'),
  id: z.string().uuid().optional(),
  scopeLevel,
  scopeEntityId: z.string().uuid().nullable().optional(),
  title: z.string().min(1),
  isActive: z.boolean(),
  selfRescheduleHoursBefore: z.number().int().min(0),
  maxSelfReschedules: z.number().int().min(0),
  limitExceededBehavior: z.enum(['manual_request', 'deny']),
  requiresStaffConfirmation: z.boolean(),
  sortOrder: z.number().int(),
});

const upsertBody = z.discriminatedUnion('kind', [cancelUpsert, rescheduleUpsert]);

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const deps = buildAppDeps();
  if (!deps.bookingPolicies) {
    return NextResponse.json({ ok: false, error: 'booking_policies_unavailable' }, { status: 503 });
  }
  const { organizationId } = gate.ctx;
  const [cancellationPolicies, reschedulePolicies] = await Promise.all([
    deps.bookingPolicies.listCancellationPolicies(organizationId),
    deps.bookingPolicies.listReschedulePolicies(organizationId),
  ]);
  return NextResponse.json({ ok: true, cancellationPolicies, reschedulePolicies });
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
  const scopeEntityId = organizationId;

  try {
    if (parsed.data.kind === 'cancellation') {
      const data = parsed.data;
      const policy = await withDoctorWorkspacePrincipal(
        gate.ctx,
        'admin.booking-engine.policies.cancellation.upsert',
        () =>
          bookingPolicies.upsertCancellationPolicy({
            ...data,
            organizationId,
            scopeEntityId,
            notifyPatient: true,
            notifyStaff: true,
          }),
      );
      return NextResponse.json({ ok: true, policy });
    }

    const data = parsed.data;
    const policy = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.policies.reschedule.upsert',
      () =>
        bookingPolicies.upsertReschedulePolicy({
          ...data,
          organizationId,
          scopeEntityId,
          allowDifferentBranch: false,
          allowDifferentCity: false,
          allowDifferentSpecialist: false,
          allowDifferentService: false,
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
      kind: parsed.data.kind,
      errorClass: error instanceof Error ? error.name : 'unknown',
    });
    return NextResponse.json(
      { ok: false, error: 'booking_policy_write_unavailable' },
      { status: 503 },
    );
  }
}
