import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { jsonIfInvalidUuid } from '../../_uuid';
import { requireClinicManagementBookingEngine } from '../../_requireClinicManagementBookingEngine';

const PatchSchema = z.object({
  fullName: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.catalog.getSpecialist(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const specialist = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.specialists.update',
    () =>
      gate.ctx.service.catalog.upsertSpecialist({
        organizationId: existing.organizationId,
        id,
        fullName: parsed.data.fullName ?? existing.fullName,
        description:
          parsed.data.description !== undefined ? parsed.data.description : existing.description,
        isActive: parsed.data.isActive ?? existing.isActive,
        sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, specialist });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.catalog.getSpecialist(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.specialists.deactivate',
    () => gate.ctx.service.catalog.deactivateSpecialist(id),
  );
  return NextResponse.json({ ok });
}
