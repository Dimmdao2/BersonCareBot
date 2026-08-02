import { NextResponse } from 'next/server';
import { z } from 'zod';
import { withDoctorWorkspacePrincipal } from '@/app-layer/principal/withOrganizationPrincipal';
import { requireEntitlementForMutation } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementBookingEngine } from '../_requireAdminBookingEngine';
import { isReservedOnlineLocationIdentity } from '@/modules/booking-engine/onlineLocation';

/** Thrown by the infra atomic quota port; compared by message, not class, to keep this route free of an infra import. */
const BRANCHES_QUOTA_REACHED_MESSAGE = 'saas_quota_reached:branches';

const PostSchema = z.object({
  title: z.string().min(1).max(200),
  /** Short display name (e.g. «СПб», «Мск»). Trimmed, ≤12 chars. */
  shortTitle: z.string().trim().max(12).nullable().optional(),
  cityCode: z.string().min(1).max(80),
  address: z.string().max(500).nullable().optional(),
  timezone: z.string().max(80).optional(),
  isActive: z.boolean().optional().default(true),
  sortOrder: z.number().int().optional().default(0),
});

export async function GET() {
  const gate = await requireClinicManagementBookingEngine();
  if (!gate.ok) return gate.response;
  const branches = await gate.ctx.service.catalog.listBranches(gate.ctx.organizationId);
  return NextResponse.json({ ok: true, branches });
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
  if (isReservedOnlineLocationIdentity(parsed.data)) {
    return NextResponse.json({ ok: false, error: 'online_location_reserved' }, { status: 409 });
  }
  try {
    const branch = await withDoctorWorkspacePrincipal(
      gate.ctx,
      'admin.booking-engine.branches.upsert',
      () =>
        gate.ctx.service.catalog.createPhysicalBranch({
          organizationId: gate.ctx.organizationId,
          title: parsed.data.title.trim(),
          shortTitle: parsed.data.shortTitle ?? null,
          cityCode: parsed.data.cityCode.trim().toLowerCase(),
          address: parsed.data.address ?? null,
          timezone: parsed.data.timezone,
          isActive: parsed.data.isActive,
          sortOrder: parsed.data.sortOrder,
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
