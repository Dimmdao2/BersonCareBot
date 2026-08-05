import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { jsonIfInvalidUuid } from '../../_uuid';
import { requireAdminBookingEngine } from '../../_requireAdminBookingEngine';

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.catalog.getRoom(id);
  if (!existing) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const room = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.rooms.update',
    () =>
      gate.ctx.service.catalog.upsertRoom({
        organizationId: existing.organizationId,
        branchId: existing.branchId,
        id,
        title: parsed.data.title ?? existing.title,
        isActive: parsed.data.isActive ?? existing.isActive,
        sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, room });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireAdminBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.rooms.deactivate',
    () => gate.ctx.service.catalog.deactivateRoom(id),
  );
  return NextResponse.json({ ok });
}
