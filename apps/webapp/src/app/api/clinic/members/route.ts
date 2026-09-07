import { NextResponse } from 'next/server';
import { z } from 'zod';
import { buildAppDeps } from '@/app-layer/di/buildAppDeps';
import { requireEntitlementForRead } from '@/app-layer/guards/requireEntitlement';
import { requireClinicManagementApiContext } from '@/app-layer/guards/requireRole';
import { isSeatConsumingMember } from '@/modules/clinic-seats/service';

export async function GET() {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;

  const deps = buildAppDeps();
  const [members, seats] = await Promise.all([
    deps.organizationMembership.listOrganizationMembers(gate.ctx.organizationId),
    deps.clinicSeats.getSeatStatus(gate.ctx.organizationId, gate.ctx.session.user.userId),
  ]);

  return NextResponse.json({
    ok: true,
    members: members.map((member) => ({
      id: member.id,
      displayName: member.displayName,
      role: member.role,
      status: member.status,
      canManageOrganization: member.role === 'owner' || member.role === 'admin',
      specialistLinked: member.specialistId !== null,
      appointmentsManageOwn: member.appointmentsManageOwn,
      availabilityManageOwn: member.availabilityManageOwn,
      seatConsuming: isSeatConsumingMember(member),
    })),
    seats,
  });
}

const permissionsSchema = z.object({
  membershipId: z.string().uuid(),
  appointmentsManageOwn: z.boolean(),
  availabilityManageOwn: z.boolean(),
});

export async function PATCH(request: Request) {
  const gate = await requireClinicManagementApiContext();
  if (!gate.ok) return gate.response;
  const entitlement = await requireEntitlementForRead(gate.ctx, 'clinic_team');
  if (!entitlement.ok) return entitlement.response;
  const parsed = permissionsSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: 'invalid_body' }, { status: 400 });
  }
  const deps = buildAppDeps();
  const member = await deps.organizationMembership.getMemberByOrganization({
    organizationId: gate.ctx.organizationId,
    membershipId: parsed.data.membershipId,
  });
  if (!member) return NextResponse.json({ ok: false, error: 'not_found' }, { status: 404 });
  await deps.organizationMembership.setClinicalPermissions(parsed.data);
  return NextResponse.json({ ok: true });
}
