import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import {
  requireEntitlementForMutation,
  requireEntitlementForRead,
} from '@/app-layer/guards/requireEntitlement';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireDoctorBookingEngine } from '../../_requireDoctorBookingEngine';

const itemSchema = z.object({
  serviceId: z.string().uuid(),
  quantity: z.number().int().min(1),
  sortOrder: z.number().int().optional(),
});

const patchSchema = z.object({
  title: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).nullable().optional(),
  priceMinor: z.number().int().min(0).optional(),
  currency: z.string().length(3).optional(),
  validityDays: z.number().int().min(1).nullable().optional(),
  deductionMode: z.enum(['auto_on_visit_confirmed', 'manual']).optional(),
  isActive: z.boolean().optional(),
  items: z.array(itemSchema).min(1).optional(),
});

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await context.params;
  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const memberships = deps.memberships;
  // Fetch current package to merge with patch
  const existing = await memberships.getCatalogPackage(id, gate.ctx.organizationId);
  if (!existing) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const pkg = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'doctor.booking-engine.packages.patch',
    () =>
      memberships.upsertCatalogPackage({
        id,
        organizationId: gate.ctx.organizationId,
        title: parsed.data.title ?? existing.title,
        description:
          parsed.data.description !== undefined ? parsed.data.description : existing.description,
        priceMinor: parsed.data.priceMinor ?? existing.priceMinor,
        currency: parsed.data.currency ?? existing.currency,
        validityDays:
          parsed.data.validityDays !== undefined ? parsed.data.validityDays : existing.validityDays,
        deductionMode: parsed.data.deductionMode ?? existing.deductionMode,
        isActive: parsed.data.isActive !== undefined ? parsed.data.isActive : existing.isActive,
        items: parsed.data.items ?? existing.items,
      }),
  );
  return NextResponse.json({ ok: true, package: pkg });
}

export async function GET(_request: Request, context: RouteContext) {
  const gate = await requireDoctorBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'subscriptions');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await context.params;
  const deps = buildAppDeps();
  if (!deps.memberships) {
    return NextResponse.json({ ok: false, error: 'memberships_unavailable' }, { status: 503 });
  }
  const pkg = await deps.memberships.getCatalogPackage(id, gate.ctx.organizationId);
  if (!pkg) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, package: pkg });
}
