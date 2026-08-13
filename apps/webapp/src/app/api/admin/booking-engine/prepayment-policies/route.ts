import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  getMechanicSurfaceVisibility,
  getMechanicMutationAvailability,
  requireEntitlementForMutation,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const upsertSchema = z.discriminatedUnion('scope', [
  z.object({
    scope: z.literal('service'),
    serviceId: z.string().uuid(),
    mode: z.enum(['disabled', 'fixed_minor', 'percent', 'full_price']),
    amountMinor: z.number().int().min(0).nullable().optional(),
    percentBps: z.number().int().min(0).max(10000).nullable().optional(),
    currency: z.string().min(3).max(3).optional(),
    isActive: z.boolean().optional(),
  }),
  z.object({
    scope: z.literal('online'),
    onlineCategory: z.enum(['rehab_lfk', 'nutrition', 'general']),
    mode: z.enum(['disabled', 'fixed_minor', 'percent', 'full_price']),
    amountMinor: z.number().int().min(0).nullable().optional(),
    percentBps: z.number().int().min(0).max(10000).nullable().optional(),
    currency: z.string().min(3).max(3).optional(),
    isActive: z.boolean().optional(),
  }),
]);

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const surface = await getMechanicSurfaceVisibility(
    { organizationId: gate.ctx.organizationId },
    'booking_prepayment',
  );
  if (!surface.directUrl) {
    return NextResponse.json({
      ok: true,
      policies: [],
      availability: { available: false, reason: 'entitlement_required' },
      visible: false,
    });
  }
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  }
  const [policies, entitlementAvailability] = await Promise.all([
    deps.payments.listPrepaymentPolicies(gate.ctx.organizationId),
    getMechanicMutationAvailability(
      { organizationId: gate.ctx.organizationId },
      'booking_prepayment',
    ),
  ]);
  const availability = entitlementAvailability.available
    ? await deps.payments.getPrepaymentAvailability(gate.ctx.organizationId)
    : { available: false as const, reason: entitlementAvailability.reason };
  return NextResponse.json({ ok: true, policies, availability, visible: true });
}

export async function PUT(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const parsed = upsertSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.payments) {
    return NextResponse.json({ ok: false, error: 'payments_unavailable' }, { status: 503 });
  }
  const payments = deps.payments;
  const body = parsed.data;
  const entitlement = await requireEntitlementForMutation(
    { organizationId: gate.ctx.organizationId },
    'booking_prepayment',
  );
  if (!entitlement.ok) return entitlement.response;

  if (body.mode !== 'disabled') {

    const availability = await payments.getPrepaymentAvailability(gate.ctx.organizationId);
    if (!availability.available) {
      return NextResponse.json(
        { ok: false, error: availability.reason, availability },
        { status: 409 },
      );
    }
  }
  if (body.scope === 'service') {
    const service = await gate.ctx.service.services.getService(body.serviceId);
    if (!service || service.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'service_not_found' }, { status: 404 });
    }
  }
  const policy = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.prepayment-policies.upsert',
    () =>
      payments.upsertPrepaymentPolicy({
        organizationId: gate.ctx.organizationId,
        serviceId: body.scope === 'service' ? body.serviceId : null,
        onlineCategory: body.scope === 'online' ? body.onlineCategory : null,
        mode: body.mode,
        amountMinor: body.amountMinor ?? null,
        percentBps: body.percentBps ?? null,
        currency: body.currency,
        isActive: body.isActive,
      }),
  );
  return NextResponse.json({ ok: true, policy });
}
