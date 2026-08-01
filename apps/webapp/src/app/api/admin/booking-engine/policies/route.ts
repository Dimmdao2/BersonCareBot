import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireAdminBookingEngine';

const scopeLevel = z.enum(['organization', 'specialist', 'service', 'product']);

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
  notifyPatient: z.boolean(),
  notifyStaff: z.boolean(),
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
  allowDifferentBranch: z.boolean(),
  allowDifferentCity: z.boolean(),
  allowDifferentSpecialist: z.boolean(),
  allowDifferentService: z.boolean(),
  limitExceededBehavior: z.enum(['manual_request', 'deny']),
  requiresStaffConfirmation: z.boolean(),
  notifyPatient: z.boolean(),
  notifyStaff: z.boolean(),
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
  const scopeEntityId =
    parsed.data.scopeEntityId ??
    (parsed.data.scopeLevel === 'organization' ? organizationId : null);
  if (!scopeEntityId) {
    return NextResponse.json({ ok: false, error: 'scope_entity_required' }, { status: 400 });
  }
  let scopeBelongsToOrganization = scopeEntityId === organizationId;
  if (parsed.data.scopeLevel === 'specialist') {
    const specialist = await gate.ctx.service.catalog.getSpecialist(scopeEntityId);
    scopeBelongsToOrganization = specialist?.organizationId === organizationId;
  } else if (parsed.data.scopeLevel === 'service') {
    const service = await gate.ctx.service.services.getService(scopeEntityId);
    scopeBelongsToOrganization = service?.organizationId === organizationId;
  } else if (parsed.data.scopeLevel === 'product') {
    // Product catalog was cut (B1.4, docs/_TODO/SAAS_FOUNDATION/SAAS_BILLING_PLAN.md) — no source
    // left to validate a product-scoped policy against, so this scope level can never resolve.
    scopeBelongsToOrganization = false;
  }
  if (!scopeBelongsToOrganization) {
    return NextResponse.json({ ok: false, error: 'scope_entity_not_found' }, { status: 404 });
  }

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
      }),
  );
  return NextResponse.json({ ok: true, policy });
}
