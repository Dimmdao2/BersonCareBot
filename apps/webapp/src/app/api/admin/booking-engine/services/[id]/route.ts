import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { jsonIfInvalidUuid } from '../../_uuid';
import { requireClinicManagementBookingEngine } from '../../_requireAdminBookingEngine';

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  description: z.union([z.string().max(2000), z.null()]).optional(),
  durationMinutes: z
    .number()
    .int()
    .min(1)
    .max(24 * 60)
    .optional(),
  bufferAfterMinutes: z
    .number()
    .int()
    .min(0)
    .max(24 * 60)
    .refine((n) => n % 5 === 0)
    .optional(),
  priceMinor: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
  prepaymentApplicable: z.boolean().optional(),
  usableInPackages: z.boolean().optional(),
  onlinePaymentApplicable: z.boolean().optional(),
  publicWidgetVisible: z.boolean().optional(),
  adminManualOnly: z.boolean().optional(),
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
  const existing = await gate.ctx.service.services.getService(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  const service = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.services.update',
    () =>
      gate.ctx.service.services.upsertService({
        organizationId: existing.organizationId,
        id,
        title: parsed.data.title ?? existing.title,
        description:
          parsed.data.description !== undefined ? parsed.data.description : existing.description,
        durationMinutes: parsed.data.durationMinutes ?? existing.durationMinutes,
        bufferAfterMinutes: parsed.data.bufferAfterMinutes ?? existing.bufferAfterMinutes,
        priceMinor: parsed.data.priceMinor ?? existing.priceMinor,
        isActive: parsed.data.isActive ?? existing.isActive,
        prepaymentApplicable: parsed.data.prepaymentApplicable ?? existing.prepaymentApplicable,
        usableInPackages: parsed.data.usableInPackages ?? existing.usableInPackages,
        onlinePaymentApplicable:
          parsed.data.onlinePaymentApplicable ?? existing.onlinePaymentApplicable,
        publicWidgetVisible: parsed.data.publicWidgetVisible ?? existing.publicWidgetVisible,
        adminManualOnly: parsed.data.adminManualOnly ?? existing.adminManualOnly,
        sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
      }),
  );
  return NextResponse.json({ ok: true, service });
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const bad = jsonIfInvalidUuid(id);
  if (bad) return bad;
  const existing = await gate.ctx.service.services.getService(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.services.deactivate',
    () => gate.ctx.service.services.deactivateService(id),
  );
  return NextResponse.json({ ok });
}
