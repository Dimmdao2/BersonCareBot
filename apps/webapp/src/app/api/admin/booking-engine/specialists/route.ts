import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../_requireClinicManagementBookingEngine';

const PostSchema = z.object({
  fullName: z.string().min(1).max(200),
  description: z.string().max(2000).nullable().optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
  branchId: z.string().uuid().optional(),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const specialists = await gate.ctx.service.catalog.listSpecialists(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, specialists });
}

export async function POST(request: Request) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'booking');
  if (!entitlement.ok) return entitlement.response;
  const body = await request.json().catch(() => null);
  const parsed = PostSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  if (parsed.data.branchId) {
    const branch = await gate.ctx.service.catalog.getBranch(parsed.data.branchId);
    if (!branch || branch.organizationId !== gate.ctx.organizationId) {
      return NextResponse.json({ ok: false, error: 'branch_not_found' }, { status: 404 });
    }
  }
  const specialist = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.specialists.upsert',
    async () => {
      const row = await gate.ctx.service.catalog.upsertSpecialist({
        organizationId: gate.ctx.organizationId,
        fullName: parsed.data.fullName.trim(),
        description: parsed.data.description ?? null,
        isActive: parsed.data.isActive,
        sortOrder: parsed.data.sortOrder,
      });
      if (parsed.data.branchId) {
        await gate.ctx.service.catalog.setSpecialistLocation({
          organizationId: gate.ctx.organizationId,
          specialistId: row.id,
          branchId: parsed.data.branchId,
          isActive: true,
        });
      }
      return row;
    },
  );
  return NextResponse.json({ ok: true, specialist });
}
