import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../../_requireAdminBookingEngine';

/** Thrown by the infra atomic quota port; compared by message, not class, to keep this route free of an infra import. */
const BRANCHES_QUOTA_REACHED_MESSAGE = 'saas_quota_reached:branches';
import {
  isBuiltInOnlineLocation,
  isReservedOnlineLocationIdentity,
} from '@/modules/booking-engine/onlineLocation';

const PatchSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  /** Short display name (e.g. «СПб», «Мск»). Trimmed, ≤12 chars. Pass null to clear. */
  shortTitle: z.string().trim().max(12).nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9A-Fa-f]{6}$/)
    .nullable()
    .optional(),
  cityCode: z.string().min(1).max(80).optional(),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().max(80).optional(),
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});

export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'branches');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const existing = await gate.ctx.service.catalog.getBranch(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (isBuiltInOnlineLocation(existing)) {
    return NextResponse.json({ ok: false, error: 'online_location_reserved' }, { status: 409 });
  }
  const body = await request.json().catch(() => null);
  const parsed = PatchSchema.safeParse(body);
  if (!parsed.success)
    return NextResponse.json({ ok: false, error: 'invalid_input' }, { status: 400 });
  if (
    isReservedOnlineLocationIdentity({
      title: parsed.data.title ?? existing.title,
      cityCode: parsed.data.cityCode ?? existing.cityCode,
    })
  ) {
    return NextResponse.json({ ok: false, error: 'online_location_reserved' }, { status: 409 });
  }
  try {
    const branch = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.branches.update',
      () =>
        gate.ctx.service.catalog.upsertBranch({
          organizationId: existing.organizationId,
          id,
          title: parsed.data.title ?? existing.title,
          ...(parsed.data.shortTitle !== undefined ? { shortTitle: parsed.data.shortTitle } : {}),
          ...(parsed.data.color !== undefined ? { color: parsed.data.color } : {}),
          cityCode: parsed.data.cityCode ?? existing.cityCode,
          address: parsed.data.address !== undefined ? parsed.data.address : existing.address,
          timezone: parsed.data.timezone ?? existing.timezone,
          isActive: parsed.data.isActive ?? existing.isActive,
          sortOrder: parsed.data.sortOrder ?? existing.sortOrder,
        }),
    );
    return NextResponse.json({ ok: true, branch });
  } catch (error) {
    if (error instanceof Error && error.message === BRANCHES_QUOTA_REACHED_MESSAGE) {
      return NextResponse.json({ ok: false, error: 'branch_limit_reached' }, { status: 403 });
    }
    throw error;
  }
}

export async function DELETE(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForMutation(gate.ctx, 'branches');
  if (!entitlement.ok) return entitlement.response;
  const { id } = await ctx.params;
  const existing = await gate.ctx.service.catalog.getBranch(id);
  if (!existing || existing.organizationId !== gate.ctx.organizationId) {
    return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  }
  if (isBuiltInOnlineLocation(existing)) {
    return NextResponse.json({ ok: false, error: 'online_location_reserved' }, { status: 409 });
  }
  const ok = await withDoctorWorkspacePrincipal(
    gate.ctx,
    'admin.booking-engine.branches.deactivate',
    () => gate.ctx.service.catalog.deactivateBranch(id),
  );
  return NextResponse.json({ ok });
}
